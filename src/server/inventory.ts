import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware } from '~/lib/auth.server'
import { mutationRateLimit, readRateLimit } from '~/lib/rate-limit'

async function getOwnedStoreId(merchantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM stores WHERE merchant_id = ${merchantId}`
  const store = rows[0]
  if (!store) throw new Error('Boutique introuvable')
  return store.id
}

export interface InventoryRow {
  variantId: string
  productId: string
  productName: string
  productSku: string
  variantLabel: string
  stockQuantity: number
  lowStockThreshold: number
  isLowStock: boolean
}

const listInventorySchema = z.object({
  lowStockOnly: z.boolean().optional(),
})

export const listMyInventory = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .validator(listInventorySchema)
  .handler(async ({ context, data }): Promise<InventoryRow[]> => {
    const storeId = await getOwnedStoreId(context.merchantId)

    return sql<InventoryRow[]>`
      SELECT
        v.id AS variant_id,
        p.id AS product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        v.label AS variant_label,
        v.stock_quantity,
        v.low_stock_threshold,
        (v.stock_quantity <= v.low_stock_threshold) AS is_low_stock
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE p.store_id = ${storeId}
        AND (${data.lowStockOnly ?? false} = false OR v.stock_quantity <= v.low_stock_threshold)
      ORDER BY p.name ASC, v.label ASC
    `
  })

// ---------- Manual adjustment ----------

const adjustSchema = z.object({
  variantId: z.string().uuid(),
  delta: z.number().int(), // positive = add stock, negative = remove
  note: z.string().max(500).optional(),
})

async function assertVariantOwnership(variantId: string, storeId: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    SELECT v.id FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE v.id = ${variantId} AND p.store_id = ${storeId}
  `
  if (rows.length === 0) throw new Error('Variante introuvable')
}

export const adjustMyInventory = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(adjustSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertVariantOwnership(data.variantId, storeId)

    await sql.begin(async (tx) => {
      const rows = await tx<{ stockQuantity: number }[]>`
        SELECT stock_quantity FROM product_variants WHERE id = ${data.variantId} FOR UPDATE
      `
      const newQuantity = rows[0].stockQuantity + data.delta
      if (newQuantity < 0) {
        throw new Error('Le stock ne peut pas devenir négatif')
      }

      await tx`
        UPDATE product_variants SET stock_quantity = ${newQuantity}, updated_at = now()
        WHERE id = ${data.variantId}
      `
      await tx`
        INSERT INTO inventory_movements (variant_id, delta, reason, note, created_by_merchant_id)
        VALUES (${data.variantId}, ${data.delta}, 'manual_adjustment', ${data.note ?? null}, ${context.merchantId})
      `
    })

    return { ok: true }
  })

// ---------- Movement history for a variant ----------

export interface MovementRow {
  id: string
  delta: number
  reason: string
  note: string | null
  createdAt: Date
}

export const listVariantMovements = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .validator(z.object({ variantId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<MovementRow[]> => {
    const storeId = await getOwnedStoreId(context.merchantId)
    await assertVariantOwnership(data.variantId, storeId)

    return sql<MovementRow[]>`
      SELECT id, delta, reason, note, created_at
      FROM inventory_movements
      WHERE variant_id = ${data.variantId}
      ORDER BY created_at DESC
      LIMIT 100
    `
  })



