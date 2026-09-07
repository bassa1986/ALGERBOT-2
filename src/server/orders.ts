import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware } from '~/lib/auth.server'
import { sanitizeSearchInput } from '~/lib/sanitize'
import { mutationRateLimit, readRateLimit } from '~/lib/rate-limit'

// Checklist steps in their fixed forward sequence. 'cancelled' is a
// terminal side-branch reachable from any non-terminal step, not part of
// the forward sequence itself.
const CHECKLIST_STEPS = ['confirmed', 'packed', 'handed_to_courier', 'delivered', 'paid'] as const
type ChecklistStep = (typeof CHECKLIST_STEPS)[number]

async function getOwnedStoreId(merchantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM stores WHERE merchant_id = ${merchantId}`
  const store = rows[0]
  if (!store) throw new Error('Boutique introuvable')
  return store.id
}

// ---------- List (filterable) ----------

export interface OrderListItem {
  id: string
  trackingCode: string
  buyerName: string
  buyerPhone: string
  status: string
  totalCentimes: number
  createdAt: Date
}

const listOrdersSchema = z.object({
  status: z.enum([...CHECKLIST_STEPS, 'cancelled']).optional(),
  search: z.string().max(120).optional(), // matches tracking code or buyer phone
})

export const listMyOrders = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .validator(listOrdersSchema)
  .handler(async ({ context, data }): Promise<OrderListItem[]> => {
    const storeId = await getOwnedStoreId(context.merchantId)
    const searchPattern = sanitizeSearchInput(data.search)

    return sql<OrderListItem[]>`
      SELECT id, tracking_code, buyer_name, buyer_phone, status, total_centimes, created_at
      FROM orders
      WHERE store_id = ${storeId}
        AND (${data.status ?? null}::text IS NULL OR status = ${data.status ?? null})
        AND (
          ${searchPattern}::text IS NULL
          OR tracking_code ILIKE ${searchPattern}
          OR buyer_phone ILIKE ${searchPattern}
        )
      ORDER BY created_at DESC
      LIMIT 200
    `
  })

// ---------- Detail ----------

export interface OrderItemRow {
  id: string
  productNameSnapshot: string
  variantLabelSnapshot: string | null
  unitPriceCentimes: number
  quantity: number
  lineTotalCentimes: number
}

export interface ChecklistEventRow {
  id: string
  step: string
  note: string | null
  createdAt: Date
}

export interface OrderDetail {
  id: string
  trackingCode: string
  buyerName: string
  buyerPhone: string
  buyerWilayaCode: number
  buyerCommune: string
  buyerAddress: string
  buyerNotes: string | null
  subtotalCentimes: number
  deliveryFeeCentimes: number
  totalCentimes: number
  status: string
  cancelReason: string | null
  createdAt: Date
  items: OrderItemRow[]
  events: ChecklistEventRow[]
}

async function assertOrderOwnership(orderId: string, storeId: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId} AND store_id = ${storeId}`
  if (rows.length === 0) throw new Error('Commande introuvable')
}

export const getMyOrder = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<OrderDetail> => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertOrderOwnership(data.orderId, storeId)

    const [orderRows, items, events] = await Promise.all([
      sql<Omit<OrderDetail, 'items' | 'events'>[]>`
        SELECT id, tracking_code, buyer_name, buyer_phone, buyer_wilaya_code, buyer_commune,
               buyer_address, buyer_notes, subtotal_centimes, delivery_fee_centimes,
               total_centimes, status, cancel_reason, created_at
        FROM orders WHERE id = ${data.orderId}
      `,
      sql<OrderItemRow[]>`
        SELECT id, product_name_snapshot, variant_label_snapshot, unit_price_centimes, quantity, line_total_centimes
        FROM order_items WHERE order_id = ${data.orderId}
      `,
      sql<ChecklistEventRow[]>`
        SELECT id, step, note, created_at
        FROM order_checklist_events WHERE order_id = ${data.orderId} ORDER BY created_at ASC
      `,
    ])

    return { ...orderRows[0], items, events }
  })

// ---------- Advance checklist step ----------

function nextAllowedSteps(current: string): ChecklistStep[] {
  const index = CHECKLIST_STEPS.indexOf(current as ChecklistStep)
  if (index === -1 || index === CHECKLIST_STEPS.length - 1) return []
  return [CHECKLIST_STEPS[index + 1]]
}

const advanceSchema = z.object({
  orderId: z.string().uuid(),
  step: z.enum(CHECKLIST_STEPS),
  note: z.string().max(500).optional(),
})

export const advanceOrderChecklist = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(advanceSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertOrderOwnership(data.orderId, storeId)

    const currentRows = await sql<{ status: string }[]>`SELECT status FROM orders WHERE id = ${data.orderId}`
    const current = currentRows[0].status

    if (current === 'cancelled') {
      throw new Error('Cette commande est annulée')
    }
    const allowed = nextAllowedSteps(current)
    if (!allowed.includes(data.step)) {
      throw new Error(`Impossible de passer de "${current}" à "${data.step}"`)
    }

    await sql.begin(async (tx) => {
      await tx`UPDATE orders SET status = ${data.step}, updated_at = now() WHERE id = ${data.orderId}`
      await tx`
        INSERT INTO order_checklist_events (order_id, step, actor_merchant_id, note)
        VALUES (${data.orderId}, ${data.step}, ${context.merchantId}, ${data.note ?? null})
      `
    })

    return { ok: true }
  })

// ---------- Cancel with reason ----------

const cancelSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})

export const cancelMyOrder = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(cancelSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertOrderOwnership(data.orderId, storeId)

    const currentRows = await sql<{ status: string }[]>`SELECT status FROM orders WHERE id = ${data.orderId}`
    const current = currentRows[0].status
    if (current === 'cancelled' || current === 'delivered' || current === 'paid') {
      throw new Error(`Impossible d'annuler une commande "${current}"`)
    }

    await sql.begin(async (tx) => {
      await tx`
        UPDATE orders SET status = 'cancelled', cancel_reason = ${data.reason}, updated_at = now()
        WHERE id = ${data.orderId}
      `
      await tx`
        INSERT INTO order_checklist_events (order_id, step, actor_merchant_id, note)
        VALUES (${data.orderId}, 'cancelled', ${context.merchantId}, ${data.reason})
      `

      // Restock: reverse the stock decrement that was applied at checkout
      // (see checkout.ts, Step 10) for every line item on this order.
      const items = await tx<{ variantId: string | null; quantity: number }[]>`
        SELECT variant_id, quantity FROM order_items WHERE order_id = ${data.orderId}
      `
      for (const item of items) {
        if (!item.variantId) continue
        await tx`
          UPDATE product_variants SET stock_quantity = stock_quantity + ${item.quantity}, updated_at = now()
          WHERE id = ${item.variantId}
        `
        await tx`
          INSERT INTO inventory_movements (variant_id, delta, reason, order_id, created_by_merchant_id)
          VALUES (${item.variantId}, ${item.quantity}, 'order_cancelled', ${data.orderId}, ${context.merchantId})
        `
      }
    })

    return { ok: true }
  })



