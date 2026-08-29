import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db.server'
import { merchantAuthMiddleware } from '~/lib/auth'
import { mutationRateLimit, readRateLimit } from '~/lib/rate-limit'

// Every handler here re-derives the store id from the session-owned
// merchant, then filters by it — a merchant can never read or write another
// merchant's products, even if they guess a product id.

async function getOwnedStoreId(merchantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM stores WHERE merchant_id = ${merchantId}`
  const store = rows[0]
  if (!store) throw new Error('Boutique introuvable')
  return store.id
}

async function assertProductOwnership(productId: string, storeId: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM products WHERE id = ${productId} AND store_id = ${storeId}
  `
  if (rows.length === 0) throw new Error('Produit introuvable')
}

// ---------- List / detail ----------

export interface ProductListItem {
  id: string
  sku: string
  name: string
  priceCentimes: number
  isPublished: boolean
  categoryId: string | null
  coverImageUrl: string | null
  imageCount: number
  totalStock: number
}

export const listMyProducts = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }): Promise<ProductListItem[]> => {
    const storeId = await getOwnedStoreId(context.merchantId)
    return sql<ProductListItem[]>`
      SELECT
        p.id, p.sku, p.name, p.price_centimes, p.is_published, p.category_id,
        cover.url AS cover_image_url,
        COALESCE(img_count.count, 0)::int AS image_count,
        COALESCE(stock.total, 0)::int AS total_stock
      FROM products p
      LEFT JOIN LATERAL (
        SELECT url FROM product_images
        WHERE product_id = p.id
        ORDER BY is_cover DESC, sort_order ASC
        LIMIT 1
      ) cover ON true
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS count FROM product_images GROUP BY product_id
      ) img_count ON img_count.product_id = p.id
      LEFT JOIN (
        SELECT product_id, SUM(stock_quantity) AS total
        FROM product_variants GROUP BY product_id
      ) stock ON stock.product_id = p.id
      WHERE p.store_id = ${storeId}
      ORDER BY p.created_at DESC
    `
  })

export interface ProductDetail {
  id: string
  sku: string
  name: string
  description: string | null
  priceCentimes: number
  isPublished: boolean
  categoryId: string | null
  images: { id: string; url: string; sortOrder: number; isCover: boolean }[]
  variants: {
    id: string
    label: string
    skuSuffix: string | null
    priceDeltaCentimes: number
    stockQuantity: number
    lowStockThreshold: number
  }[]
}

export const getMyProduct = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<ProductDetail> => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertProductOwnership(data.productId, storeId)

    const [productRows, images, variants] = await Promise.all([
      sql<
        {
          id: string
          sku: string
          name: string
          description: string | null
          priceCentimes: number
          isPublished: boolean
          categoryId: string | null
        }[]
      >`
        SELECT id, sku, name, description, price_centimes, is_published, category_id
        FROM products WHERE id = ${data.productId}
      `,
      sql<{ id: string; url: string; sortOrder: number; isCover: boolean }[]>`
        SELECT id, url, sort_order, is_cover FROM product_images
        WHERE product_id = ${data.productId} ORDER BY sort_order ASC
      `,
      sql<
        {
          id: string
          label: string
          skuSuffix: string | null
          priceDeltaCentimes: number
          stockQuantity: number
          lowStockThreshold: number
        }[]
      >`
        SELECT id, label, sku_suffix, price_delta_centimes, stock_quantity, low_stock_threshold
        FROM product_variants WHERE product_id = ${data.productId} ORDER BY created_at ASC
      `,
    ])

    return { ...productRows[0], images, variants }
  })

// ---------- Create / update / publish toggle ----------

const productInputSchema = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  priceCentimes: z.number().int().min(0),
  categoryId: z.string().uuid().optional(),
})

export const createMyProduct = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(productInputSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)

    const existingSku = await sql<{ id: string }[]>`
      SELECT id FROM products WHERE store_id = ${storeId} AND sku = ${data.sku}
    `
    if (existingSku.length > 0) {
      throw new Error(`Le SKU "${data.sku}" existe déjà dans votre boutique`)
    }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO products (store_id, sku, name, description, price_centimes, category_id)
      VALUES (${storeId}, ${data.sku}, ${data.name}, ${data.description ?? null}, ${data.priceCentimes}, ${data.categoryId ?? null})
      RETURNING id
    `
    return { id: rows[0].id }
  })

const updateProductSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  priceCentimes: z.number().int().min(0).optional(),
  categoryId: z.string().uuid().nullable().optional(),
})

export const updateMyProduct = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(updateProductSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertProductOwnership(data.productId, storeId)

    if (data.sku !== undefined) {
      const conflict = await sql<{ id: string }[]>`
        SELECT id FROM products
        WHERE store_id = ${storeId} AND sku = ${data.sku} AND id != ${data.productId}
      `
      if (conflict.length > 0) {
        throw new Error(`Le SKU "${data.sku}" existe déjà dans votre boutique`)
      }
    }

    await sql`
      UPDATE products SET
        sku = COALESCE(${data.sku ?? null}, sku),
        name = COALESCE(${data.name ?? null}, name),
        description = CASE WHEN ${data.description !== undefined} THEN ${data.description ?? null} ELSE description END,
        price_centimes = COALESCE(${data.priceCentimes ?? null}, price_centimes),
        category_id = CASE WHEN ${data.categoryId !== undefined} THEN ${data.categoryId ?? null} ELSE category_id END,
        updated_at = now()
      WHERE id = ${data.productId}
    `
    return { ok: true }
  })

export const setMyProductPublished = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware])
  .validator(z.object({ productId: z.string().uuid(), isPublished: z.boolean() }))
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertProductOwnership(data.productId, storeId)

    await sql`
      UPDATE products SET is_published = ${data.isPublished}, updated_at = now()
      WHERE id = ${data.productId}
    `
    return { ok: true }
  })

export const deleteMyProduct = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertProductOwnership(data.productId, storeId)

    // ON DELETE CASCADE on product_images/product_variants handles cleanup;
    // order_items keeps a snapshot so historical orders are unaffected.
    await sql`DELETE FROM products WHERE id = ${data.productId}`
    return { ok: true }
  })

// ---------- Variants ----------

const variantInputSchema = z.object({
  productId: z.string().uuid(),
  label: z.string().min(1).max(120),
  skuSuffix: z.string().max(40).optional(),
  priceDeltaCentimes: z.number().int().default(0),
  stockQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(3),
})

export const createMyVariant = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(variantInputSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertProductOwnership(data.productId, storeId)

    const rows = await sql<{ id: string }[]>`
      INSERT INTO product_variants (product_id, label, sku_suffix, price_delta_centimes, stock_quantity, low_stock_threshold)
      VALUES (${data.productId}, ${data.label}, ${data.skuSuffix ?? null}, ${data.priceDeltaCentimes}, ${data.stockQuantity}, ${data.lowStockThreshold})
      RETURNING id
    `

    if (data.stockQuantity > 0) {
      await sql`
        INSERT INTO inventory_movements (variant_id, delta, reason, created_by_merchant_id)
        VALUES (${rows[0].id}, ${data.stockQuantity}, 'initial_stock', ${context.merchantId})
      `
    }

    return { id: rows[0].id }
  })

const updateVariantSchema = z.object({
  variantId: z.string().uuid(),
  label: z.string().min(1).max(120).optional(),
  skuSuffix: z.string().max(40).nullable().optional(),
  priceDeltaCentimes: z.number().int().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
})

async function assertVariantOwnership(variantId: string, storeId: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    SELECT v.id FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE v.id = ${variantId} AND p.store_id = ${storeId}
  `
  if (rows.length === 0) throw new Error('Variante introuvable')
}

export const updateMyVariant = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(updateVariantSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertVariantOwnership(data.variantId, storeId)

    await sql`
      UPDATE product_variants SET
        label = COALESCE(${data.label ?? null}, label),
        sku_suffix = CASE WHEN ${data.skuSuffix !== undefined} THEN ${data.skuSuffix ?? null} ELSE sku_suffix END,
        price_delta_centimes = COALESCE(${data.priceDeltaCentimes ?? null}, price_delta_centimes),
        low_stock_threshold = COALESCE(${data.lowStockThreshold ?? null}, low_stock_threshold),
        updated_at = now()
      WHERE id = ${data.variantId}
    `
    return { ok: true }
  })

export const deleteMyVariant = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(z.object({ variantId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertVariantOwnership(data.variantId, storeId)

    await sql`DELETE FROM product_variants WHERE id = ${data.variantId}`
    return { ok: true }
  })

