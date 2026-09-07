import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import type { StoreLayoutVariant } from '~/server/store'
import { sanitizeSearchInput } from '~/lib/sanitize'
import { publicRateLimit } from '~/lib/rate-limit'

// Everything here is public / no-auth — this is what buyers see. Every
// query filters by is_published (store) and is_published (product) plus an
// active (non-expired) subscription, so an unpublished store or a store
// whose subscription lapsed never appears to buyers, per spec ("Expired
// unpaid stores are hidden from the marketplace but keep their data").

export interface PublicStore {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  layoutVariant: StoreLayoutVariant
  merchantId: string
  merchantTelegramUsername: string | null
  merchantWhatsappNumber: string | null
  merchantPhone: string | null
  googleMapsUrl: string | null
  themeId: string | null
  wilayaNameAr: string | null
  wilayaNameFr: string | null
  communeNameAr: string | null
  communeNameFr: string | null
}

async function isStoreVisible(storeId: string): Promise<boolean> {
  const rows = await sql<{ ok: boolean }[]>`
    SELECT (s.is_published AND sub.current_period_expires_at > now()) AS ok
    FROM stores s
    JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
    WHERE s.id = ${storeId}
  `
  return rows[0]?.ok ?? false
}

export const getPublicStoreBySlug = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }): Promise<PublicStore | null> => {
    const rows = await sql<PublicStore[]>`
      SELECT
        s.id, s.slug, s.name, s.description, s.logo_url, s.banner_url, s.layout_variant,
        s.merchant_id,
        m.telegram_username AS merchant_telegram_username,
        m.whatsapp_number AS merchant_whatsapp_number,
        CASE WHEN m.phone_visible_in_storefront THEN m.phone ELSE NULL END AS merchant_phone,
        s.google_maps_url,
        s.theme_id,
        w.name_ar AS wilaya_name_ar, w.name_fr AS wilaya_name_fr,
        cm.name_ar AS commune_name_ar, cm.name_fr AS commune_name_fr
      FROM stores s
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      JOIN merchants m ON m.id = s.merchant_id
      LEFT JOIN wilayas w ON w.code = s.base_wilaya_code
      LEFT JOIN communes cm ON cm.wilaya_code = s.base_wilaya_code AND cm.code = s.base_commune_code
      WHERE s.slug = ${data.slug} AND s.is_published = true AND sub.current_period_expires_at > now()
    `
    return rows[0] ?? null
  })

export interface PublicProductCard {
  id: string
  name: string
  priceCentimes: number
  coverImageUrl: string | null
  imageUrls: string[]
  categorySlug: string | null
  totalStock: number
  hasVariants: boolean
  createdAt: Date
}

const listProductsSchema = z.object({
  storeSlug: z.string().min(1).max(120),
  categorySlug: z.string().max(120).optional(),
  search: z.string().max(120).optional(),
})

/**
 * Plain function (not a createServerFn) returning a lightweight product
 * list for one store — for callers that aren't React components calling
 * an RPC, like the WhatsApp Flow Data Endpoint route
 * (src/routes/api/whatsapp/flow-endpoint.ts), which needs to query the DB
 * directly from a plain HTTP handler. Deliberately minimal (id/name/price
 * only) since a Flow's RadioButtonsGroup only needs a short label per
 * option, not the full PublicProductCard shape.
 */
export async function listStoreProductsForFlow(
  storeSlug: string,
): Promise<{ id: string; name: string; priceCentimes: number }[]> {
  return sql<{ id: string; name: string; priceCentimes: number }[]>`
    SELECT p.id, p.name, p.price_centimes
    FROM products p
    JOIN stores s ON s.id = p.store_id
    JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
    WHERE s.slug = ${storeSlug}
      AND s.is_published = true
      AND p.is_published = true
      AND sub.current_period_expires_at > now()
    ORDER BY p.created_at DESC
    LIMIT 50
  `
}

/** A product's own name/price plus its variants, for the WhatsApp Flow's PRODUCT_DETAILS screen. */
export async function getProductWithVariantsForFlow(productId: string): Promise<{
  id: string
  name: string
  priceCentimes: number
  variants: { id: string; label: string; priceDeltaCentimes: number; stockQuantity: number }[]
} | null> {
  const productRows = await sql<{ id: string; name: string; priceCentimes: number }[]>`
    SELECT id, name, price_centimes FROM products WHERE id = ${productId} AND is_published = true
  `
  const product = productRows[0]
  if (!product) return null

  const variants = await sql<{ id: string; label: string; priceDeltaCentimes: number; stockQuantity: number }[]>`
    SELECT id, label, price_delta_centimes, stock_quantity FROM product_variants WHERE product_id = ${productId}
  `
  return { ...product, variants }
}

export interface FlowOrderPreviewInput {
  storeSlug: string
  productId: string
  variantId: string | null
  quantity: number
  wilayaCode: number
}

export interface FlowOrderPreviewResult {
  canDeliver: boolean
  errorText: string | null
  subtotalCentimes: number
  deliveryFeeCentimes: number
  totalCentimes: number
}

/**
 * Non-mutating preview of what createOrder() would charge, for the
 * WhatsApp Flow's REVIEW screen to show before the buyer actually
 * confirms. Deliberately read-only (no stock lock, no row updates) since
 * the buyer can still back out at this stage — createOrder() itself
 * re-validates everything from scratch when the order is actually placed,
 * so this preview being briefly stale (e.g. stock changes between preview
 * and confirm) is not a correctness issue, only a UX one.
 */
export async function previewFlowOrder(input: FlowOrderPreviewInput): Promise<FlowOrderPreviewResult> {
  const storeRows = await sql<{ id: string }[]>`
    SELECT s.id FROM stores s
    JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
    WHERE s.slug = ${input.storeSlug} AND s.is_published = true AND sub.current_period_expires_at > now()
  `
  const store = storeRows[0]
  if (!store) return { canDeliver: false, errorText: 'Boutique indisponible', subtotalCentimes: 0, deliveryFeeCentimes: 0, totalCentimes: 0 }

  const zoneRows = await sql<{ feeCentimes: number }[]>`
    SELECT fee_centimes FROM store_delivery_zones WHERE store_id = ${store.id} AND wilaya_code = ${input.wilayaCode}
  `
  const zone = zoneRows[0]
  if (!zone) {
    return {
      canDeliver: false,
      errorText: 'Cette boutique ne livre pas dans votre wilaya.',
      subtotalCentimes: 0,
      deliveryFeeCentimes: 0,
      totalCentimes: 0,
    }
  }

  const productRows = await sql<{ id: string; name: string; priceCentimes: number; storeId: string }[]>`
    SELECT id, name, price_centimes, store_id FROM products WHERE id = ${input.productId} AND is_published = true
  `
  const product = productRows[0]
  if (!product || product.storeId !== store.id) {
    return { canDeliver: false, errorText: 'Produit indisponible', subtotalCentimes: 0, deliveryFeeCentimes: 0, totalCentimes: 0 }
  }

  let unitPriceCentimes = product.priceCentimes
  if (input.variantId) {
    const variantRows = await sql<{ priceDeltaCentimes: number; stockQuantity: number; productId: string }[]>`
      SELECT price_delta_centimes, stock_quantity, product_id FROM product_variants WHERE id = ${input.variantId}
    `
    const variant = variantRows[0]
    if (!variant || variant.productId !== product.id) {
      return { canDeliver: false, errorText: 'Option indisponible', subtotalCentimes: 0, deliveryFeeCentimes: 0, totalCentimes: 0 }
    }
    if (variant.stockQuantity < input.quantity) {
      return {
        canDeliver: false,
        errorText: 'Stock insuffisant pour cette quantité.',
        subtotalCentimes: 0,
        deliveryFeeCentimes: 0,
        totalCentimes: 0,
      }
    }
    unitPriceCentimes += variant.priceDeltaCentimes
  }

  const subtotalCentimes = unitPriceCentimes * input.quantity
  const totalCentimes = subtotalCentimes + zone.feeCentimes
  return { canDeliver: true, errorText: null, subtotalCentimes, deliveryFeeCentimes: zone.feeCentimes, totalCentimes }
}

export const listPublicProducts = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(listProductsSchema)
  .handler(async ({ data }): Promise<PublicProductCard[]> => {
    const storeRows = await sql<{ id: string }[]>`
      SELECT s.id FROM stores s
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      WHERE s.slug = ${data.storeSlug} AND s.is_published = true AND sub.current_period_expires_at > now()
    `
    const store = storeRows[0]
    if (!store) return []

    const searchPattern = sanitizeSearchInput(data.search)

    const products = await sql<
      {
        id: string
        name: string
        priceCentimes: number
        categorySlug: string | null
        totalStock: string
        variantCount: string
        createdAt: Date
      }[]
    >`
      SELECT
        p.id, p.name, p.price_centimes, c.slug AS category_slug,
        COALESCE(stock.total, 0)::text AS total_stock,
        COALESCE(vcount.count, 0)::text AS variant_count,
        p.created_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT product_id, SUM(stock_quantity) AS total FROM product_variants GROUP BY product_id
      ) stock ON stock.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS count FROM product_variants GROUP BY product_id
      ) vcount ON vcount.product_id = p.id
      WHERE p.store_id = ${store.id}
        AND p.is_published = true
        AND (${data.categorySlug ?? null}::text IS NULL OR c.slug = ${data.categorySlug ?? null})
        AND (${searchPattern}::text IS NULL OR p.name ILIKE ${searchPattern})
      ORDER BY p.created_at DESC
    `

    if (products.length === 0) return []

    const imageRows = await sql<{ productId: string; url: string; isCover: boolean }[]>`
      SELECT product_id, url, is_cover FROM product_images
      WHERE product_id = ANY(${products.map((p) => p.id)})
      ORDER BY sort_order ASC
    `
    const imagesByProduct = new Map<string, { url: string; isCover: boolean }[]>()
    for (const img of imageRows) {
      const list = imagesByProduct.get(img.productId) ?? []
      list.push(img)
      imagesByProduct.set(img.productId, list)
    }

    return products.map((p) => {
      const images = imagesByProduct.get(p.id) ?? []
      const cover = images.find((i) => i.isCover) ?? images[0]
      return {
        id: p.id,
        name: p.name,
        priceCentimes: p.priceCentimes,
        coverImageUrl: cover?.url ?? null,
        imageUrls: images.map((i) => i.url),
        categorySlug: p.categorySlug,
        totalStock: parseInt(p.totalStock, 10),
        hasVariants: parseInt(p.variantCount, 10) > 0,
        createdAt: p.createdAt,
      }
    })
  })

export interface PublicProductDetail {
  id: string
  name: string
  description: string | null
  priceCentimes: number
  imageUrls: string[]
  variants: {
    id: string
    label: string
    priceDeltaCentimes: number
    stockQuantity: number
  }[]
}

export const getPublicProduct = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ data }): Promise<PublicProductDetail | null> => {
    const productRows = await sql<
      { id: string; name: string; description: string | null; priceCentimes: number; storeId: string }[]
    >`
      SELECT id, name, description, price_centimes, store_id
      FROM products WHERE id = ${data.productId} AND is_published = true
    `
    const product = productRows[0]
    if (!product) return null

    const visible = await isStoreVisible(product.storeId)
    if (!visible) return null

    const [images, variants] = await Promise.all([
      sql<{ url: string }[]>`
        SELECT url FROM product_images WHERE product_id = ${data.productId} ORDER BY sort_order ASC
      `,
      sql<{ id: string; label: string; priceDeltaCentimes: number; stockQuantity: number }[]>`
        SELECT id, label, price_delta_centimes, stock_quantity
        FROM product_variants WHERE product_id = ${data.productId} ORDER BY created_at ASC
      `,
    ])

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCentimes: product.priceCentimes,
      imageUrls: images.map((i) => i.url),
      variants,
    }
  })

export interface PublicCategory {
  slug: string
  nameAr: string
  nameFr: string
}

/**
 * Minimal product summary for the /share/product/$id landing page: just
 * enough for Open Graph tags (name, price, one image) plus the storeSlug
 * needed to build the correct t.me deep link redirect target. Deliberately
 * separate from getPublicProduct (used by the actual product detail page)
 * so that page's return shape doesn't need to grow for this one caller.
 */
export interface ShareableProductSummary {
  id: string
  name: string
  description: string | null
  priceCentimes: number
  imageUrl: string | null
  storeSlug: string
}

export const getShareableProductSummary = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ShareableProductSummary | null> => {
    const rows = await sql<
      {
        id: string
        name: string
        description: string | null
        priceCentimes: number
        storeId: string
        storeSlug: string
      }[]
    >`
      SELECT p.id, p.name, p.description, p.price_centimes, p.store_id, s.slug AS store_slug
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = ${data.productId} AND p.is_published = true
    `
    const product = rows[0]
    if (!product) return null

    const visible = await isStoreVisible(product.storeId)
    if (!visible) return null

    const imageRows = await sql<{ url: string }[]>`
      SELECT url FROM product_images
      WHERE product_id = ${data.productId}
      ORDER BY is_cover DESC, sort_order ASC
      LIMIT 1
    `

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCentimes: product.priceCentimes,
      imageUrl: imageRows[0]?.url ?? null,
      storeSlug: product.storeSlug,
    }
  })

/**
 * Minimal store summary for the /s/$slug/whatsapp landing page: just
 * enough to render "Chat on WhatsApp" + "Visit our shop" buttons.
 * Deliberately separate from getPublicStoreBySlug so that function's
 * return shape doesn't need to grow for this one caller, and so a store
 * with no WhatsApp number set can be handled explicitly (page shows only
 * the shop link) rather than silently reusing unrelated store data.
 */
export interface WhatsAppContactSummary {
  storeName: string
  storeSlug: string
  logoUrl: string | null
  whatsappNumber: string | null
}

export const getWhatsAppContactSummary = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }): Promise<WhatsAppContactSummary | null> => {
    const rows = await sql<WhatsAppContactSummary[]>`
      SELECT s.name AS store_name, s.slug AS store_slug, s.logo_url, m.whatsapp_number
      FROM stores s
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      JOIN merchants m ON m.id = s.merchant_id
      WHERE s.slug = ${data.slug} AND s.is_published = true AND sub.current_period_expires_at > now()
    `
    return rows[0] ?? null
  })

/** Only categories that have at least one published product in this store. */
export const listStoreCategoriesInUse = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(z.object({ storeSlug: z.string().min(1).max(120) }))
  .handler(async ({ data }): Promise<PublicCategory[]> => {
    return sql<PublicCategory[]>`
      SELECT DISTINCT c.slug, c.name_ar, c.name_fr
      FROM categories c
      JOIN products p ON p.category_id = c.id
      JOIN stores s ON s.id = p.store_id
      WHERE s.slug = ${data.storeSlug} AND p.is_published = true
      ORDER BY c.slug
    `
  })



