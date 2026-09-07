import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { notifyMerchantOfNewOrder } from '~/lib/telegram-notify'
import { publicRateLimit } from '~/lib/rate-limit'

// ---------- Tracking code ----------

function generateTrackingCode(): string {
  // Short, human-typeable code: 2 letters + 6 digits, e.g. "AB482913".
  // Not cryptographically unguessable by itself — the buyer also needs
  // their own phone number to look up an order (see lookupOrder below),
  // which is the actual access control, not code secrecy.
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O to avoid confusion with 1/0
  const letterPart =
    letters[Math.floor(Math.random() * letters.length)] +
    letters[Math.floor(Math.random() * letters.length)]
  const digitPart = Math.floor(100000 + Math.random() * 900000).toString()
  return letterPart + digitPart
}

// ---------- Checkout ----------

const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  quantity: z.number().int().min(1).max(99),
})

// H5 fix: this used to only validate the web checkout path (via
// checkoutSchema, applied by submitCheckout below). The WhatsApp Flow path
// (handleFlowCompletion -> createOrder) passed session.state fields
// straight through with bare `as string` casts and no runtime validation,
// and the orders table has no CHECK constraints on these TEXT columns
// either — so a modified/instrumented WhatsApp client could submit
// arbitrarily long or malformed buyer fields, bypassing every bound the UI
// and this schema assume hold everywhere (which also widens H4, since that
// path would then have no length cap at all going into the xlsx export).
// Validating here, inside createOrder() itself, means both callers get the
// same guarantee regardless of whether they remember to wrap it.
const createOrderInputSchema = z.object({
  storeSlug: z.string().min(1).max(120),
  items: z.array(checkoutItemSchema).min(1).max(50),
  buyerName: z.string().min(2).max(120),
  buyerPhone: z.string().min(8).max(20),
  buyerWilayaCode: z.number().int().min(1).max(69),
  buyerCommune: z.string().min(1).max(120),
  buyerAddress: z.string().min(3).max(500),
  buyerNotes: z.string().max(1000).optional(),
  sourceChannel: z.enum(['web', 'whatsapp']),
})

const checkoutSchema = z.object({
  storeSlug: z.string().min(1).max(120),
  items: z.array(checkoutItemSchema).min(1).max(50),
  buyerName: z.string().min(2).max(120),
  buyerPhone: z.string().min(8).max(20),
  buyerWilayaCode: z.number().int().min(1).max(69),
  buyerCommune: z.string().min(1).max(120),
  buyerAddress: z.string().min(3).max(500),
  buyerNotes: z.string().max(1000).optional(),
})

export interface CreateOrderInput {
  storeSlug: string
  items: { productId: string; variantId: string | null; quantity: number }[]
  buyerName: string
  buyerPhone: string
  buyerWilayaCode: number
  buyerCommune: string
  buyerAddress: string
  buyerNotes?: string
  /** Recorded on the confirmation checklist event so it's visible which channel an order came through. */
  sourceChannel: 'web' | 'whatsapp'
}

export interface CreateOrderResult {
  orderId: string
  trackingCode: string
  subtotalCentimes: number
  deliveryFeeCentimes: number
  totalCentimes: number
}

/**
 * The actual order-creation logic — validated, transactional, stock-safe
 * (row-locks variants, re-derives prices server-side, never trusts client
 * totals). Deliberately a plain function (not a createServerFn) so it has
 * exactly one implementation shared by every channel that can place an
 * order: the web checkout form (submitCheckout below) and the WhatsApp
 * Flow order webhook (src/routes/api/whatsapp/webhook.ts). Any future
 * order-placing surface should call this too, rather than re-deriving
 * prices/stock itself.
 */
export async function createOrder(rawData: CreateOrderInput): Promise<CreateOrderResult> {
  // Validated unconditionally, regardless of caller — see H5 fix note above.
  const parsed = createOrderInputSchema.safeParse(rawData)
  if (!parsed.success) {
    throw new Error('Données de commande invalides')
  }
  const data = parsed.data

  const storeRows = await sql<{ id: string }[]>`
    SELECT s.id FROM stores s
    JOIN merchants m ON m.id = s.merchant_id
    JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
    WHERE s.slug = ${data.storeSlug} AND s.is_published = true AND sub.current_period_expires_at > now()
      AND m.status != 'suspended'
  `
  const store = storeRows[0]
  if (!store) throw new Error('Boutique introuvable ou indisponible')

  // Delivery fee: must have an explicit zone row for this wilaya, per
  // schema semantics ("absence of a row means not delivered there").
  const zoneRows = await sql<{ feeCentimes: number }[]>`
    SELECT fee_centimes FROM store_delivery_zones
    WHERE store_id = ${store.id} AND wilaya_code = ${data.buyerWilayaCode}
  `
  const zone = zoneRows[0]
  if (!zone) {
    throw new Error('Cette boutique ne livre pas dans votre wilaya')
  }

  const result = await sql.begin(async (tx) => {
    // Re-fetch every product/variant server-side and lock the variant
    // rows — prices and stock are NEVER trusted from the client, and the
    // row lock prevents two concurrent checkouts from both succeeding
    // against stock that only covers one of them.
    let subtotalCentimes = 0
    const resolvedItems: {
      productId: string
      variantId: string | null
      productName: string
      variantLabel: string | null
      unitPriceCentimes: number
      quantity: number
      lineTotalCentimes: number
    }[] = []

    for (const item of data.items) {
      const productRows = await tx<
        { id: string; name: string; priceCentimes: number; storeId: string; isPublished: boolean }[]
      >`
        SELECT id, name, price_centimes, store_id, is_published FROM products WHERE id = ${item.productId}
      `
      const product = productRows[0]
      if (!product || product.storeId !== store.id || !product.isPublished) {
        throw new Error(`Produit indisponible`)
      }

      let unitPriceCentimes = product.priceCentimes
      let variantLabel: string | null = null

      if (item.variantId) {
        const variantRows = await tx<
          { id: string; label: string; priceDeltaCentimes: number; stockQuantity: number; productId: string }[]
        >`
          SELECT id, label, price_delta_centimes, stock_quantity, product_id
          FROM product_variants WHERE id = ${item.variantId} FOR UPDATE
        `
        const variant = variantRows[0]
        if (!variant || variant.productId !== product.id) {
          throw new Error(`Variante indisponible pour "${product.name}"`)
        }
        if (variant.stockQuantity < item.quantity) {
          throw new Error(`Stock insuffisant pour "${product.name} (${variant.label})"`)
        }
        unitPriceCentimes += variant.priceDeltaCentimes
        variantLabel = variant.label

        await tx`
          UPDATE product_variants SET stock_quantity = stock_quantity - ${item.quantity}, updated_at = now()
          WHERE id = ${variant.id}
        `
      }
      // Products with zero variants have no stock tracking at the
      // product level in this schema (stock lives on product_variants),
      // so a variant-less product is always orderable — consistent with
      // Step 4 allowing a product to exist with no variants.

      const lineTotalCentimes = unitPriceCentimes * item.quantity
      subtotalCentimes += lineTotalCentimes

      resolvedItems.push({
        productId: product.id,
        variantId: item.variantId,
        productName: product.name,
        variantLabel,
        unitPriceCentimes,
        quantity: item.quantity,
        lineTotalCentimes,
      })
    }

    const totalCentimes = subtotalCentimes + zone.feeCentimes

    let trackingCode = generateTrackingCode()
    // Extremely unlikely collision given the code space, but guard it
    // anyway rather than trusting randomness blindly.
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await tx<{ id: string }[]>`SELECT id FROM orders WHERE tracking_code = ${trackingCode}`
      if (existing.length === 0) break
      trackingCode = generateTrackingCode()
    }

    const orderRows = await tx<{ id: string }[]>`
      INSERT INTO orders (
        store_id, tracking_code, buyer_name, buyer_phone, buyer_wilaya_code,
        buyer_commune, buyer_address, buyer_notes,
        subtotal_centimes, delivery_fee_centimes, total_centimes, status
      )
      VALUES (
        ${store.id}, ${trackingCode}, ${data.buyerName}, ${data.buyerPhone}, ${data.buyerWilayaCode},
        ${data.buyerCommune}, ${data.buyerAddress}, ${data.buyerNotes ?? null},
        ${subtotalCentimes}, ${zone.feeCentimes}, ${totalCentimes}, 'confirmed'
      )
      RETURNING id
    `
    const orderId = orderRows[0].id

    for (const item of resolvedItems) {
      await tx`
        INSERT INTO order_items (
          order_id, product_id, variant_id, product_name_snapshot, variant_label_snapshot,
          unit_price_centimes, quantity, line_total_centimes
        )
        VALUES (
          ${orderId}, ${item.productId}, ${item.variantId}, ${item.productName}, ${item.variantLabel},
          ${item.unitPriceCentimes}, ${item.quantity}, ${item.lineTotalCentimes}
        )
      `

      if (item.variantId) {
        await tx`
          INSERT INTO inventory_movements (variant_id, delta, reason, order_id)
          VALUES (${item.variantId}, ${-item.quantity}, 'order_placed', ${orderId})
        `
      }
    }

    const confirmationNote =
      data.sourceChannel === 'whatsapp' ? 'Commande passée par WhatsApp' : "Commande passée par l'acheteur"
    await tx`
      INSERT INTO order_checklist_events (order_id, step, note)
      VALUES (${orderId}, 'confirmed', ${confirmationNote})
    `

    return {
      orderId,
      trackingCode,
      subtotalCentimes,
      deliveryFeeCentimes: zone.feeCentimes,
      totalCentimes,
    }
  })

  // Fire-and-forget style, but awaited so any error is caught by
  // notifyMerchantOfNewOrder's own internal try/catch rather than
  // becoming an unhandled rejection — deliberately outside the
  // transaction above, since a notification failure must never roll
  // back an already-committed order.
  const merchantRows = await sql<{ telegramUserId: number; storeName: string }[]>`
    SELECT m.telegram_user_id, s.name AS store_name
    FROM stores s JOIN merchants m ON m.id = s.merchant_id
    WHERE s.slug = ${data.storeSlug}
  `
  if (merchantRows[0]) {
    await notifyMerchantOfNewOrder({
      merchantTelegramUserId: merchantRows[0].telegramUserId,
      trackingCode: result.trackingCode,
      buyerName: data.buyerName,
      totalCentimes: result.totalCentimes,
      storeName: merchantRows[0].storeName,
    })
  }

  return result
}

export const submitCheckout = createServerFn({ method: 'POST' })
  .middleware([publicRateLimit])
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    return createOrder({ ...data, sourceChannel: 'web' })
  })

// ---------- Order lookup (buyer, by phone + tracking code) ----------

const lookupSchema = z.object({
  trackingCode: z.string().min(4).max(20),
  phone: z.string().min(8).max(20),
})

export interface LookupOrderResult {
  trackingCode: string
  status: string
  storeName: string
  totalCentimes: number
  createdAt: Date
  items: { productNameSnapshot: string; variantLabelSnapshot: string | null; quantity: number }[]
  events: { step: string; createdAt: Date }[]
}

export const lookupOrder = createServerFn({ method: 'POST' })
  .middleware([publicRateLimit])
  .validator(lookupSchema)
  .handler(async ({ data }): Promise<LookupOrderResult | null> => {
    const orderRows = await sql<
      { id: string; trackingCode: string; status: string; storeName: string; totalCentimes: number; createdAt: Date }[]
    >`
      SELECT o.id, o.tracking_code, o.status, s.name AS store_name, o.total_centimes, o.created_at
      FROM orders o
      JOIN stores s ON s.id = o.store_id
      WHERE o.tracking_code = ${data.trackingCode.toUpperCase()} AND o.buyer_phone = ${data.phone}
    `
    const order = orderRows[0]
    if (!order) return null

    const [items, events] = await Promise.all([
      sql<{ productNameSnapshot: string; variantLabelSnapshot: string | null; quantity: number }[]>`
        SELECT product_name_snapshot, variant_label_snapshot, quantity FROM order_items WHERE order_id = ${order.id}
      `,
      sql<{ step: string; createdAt: Date }[]>`
        SELECT step, created_at FROM order_checklist_events WHERE order_id = ${order.id} ORDER BY created_at ASC
      `,
    ])

    return { ...order, items, events }
  })


