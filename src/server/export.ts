import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware } from '~/lib/auth'
import { sanitizeSearchInput } from '~/lib/sanitize'
import { mutationRateLimit } from '~/lib/rate-limit'

async function getOwnedStoreId(merchantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM stores WHERE merchant_id = ${merchantId}`
  const store = rows[0]
  if (!store) throw new Error('Boutique introuvable')
  return store.id
}

function buildXlsxBase64(headers: string[], rows: (string | number)[][], sheetName: string): string {
  const wb = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  sheet['!cols'] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, sheet, sheetName)
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

// ---------- Orders export ----------

const exportOrdersSchema = z.object({
  status: z.enum(['confirmed', 'packed', 'handed_to_courier', 'delivered', 'paid', 'cancelled']).optional(),
  search: z.string().max(120).optional(),
})

export const exportMyOrders = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(exportOrdersSchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)
    const searchPattern = sanitizeSearchInput(data.search)

    const orders = await sql<
      {
        trackingCode: string
        buyerName: string
        buyerPhone: string
        buyerWilayaCode: number
        buyerCommune: string
        buyerAddress: string
        status: string
        subtotalCentimes: number
        deliveryFeeCentimes: number
        totalCentimes: number
        createdAt: Date
      }[]
    >`
      SELECT tracking_code, buyer_name, buyer_phone, buyer_wilaya_code, buyer_commune, buyer_address,
             status, subtotal_centimes, delivery_fee_centimes, total_centimes, created_at
      FROM orders
      WHERE store_id = ${storeId}
        AND (${data.status ?? null}::text IS NULL OR status = ${data.status ?? null})
        AND (
          ${searchPattern}::text IS NULL
          OR tracking_code ILIKE ${searchPattern}
          OR buyer_phone ILIKE ${searchPattern}
        )
      ORDER BY created_at DESC
    `

    const headers = [
      'Code de suivi', 'Client', 'Téléphone', 'Wilaya', 'Commune', 'Adresse',
      'Statut', 'Sous-total (DZD)', 'Livraison (DZD)', 'Total (DZD)', 'Date',
    ]
    const rows = orders.map((o) => [
      o.trackingCode,
      o.buyerName,
      o.buyerPhone,
      o.buyerWilayaCode,
      o.buyerCommune,
      o.buyerAddress,
      o.status,
      o.subtotalCentimes / 100,
      o.deliveryFeeCentimes / 100,
      o.totalCentimes / 100,
      o.createdAt.toISOString().slice(0, 10),
    ])

    const base64 = buildXlsxBase64(headers, rows, 'Commandes')
    return { base64, filename: `algerbot-commandes-${new Date().toISOString().slice(0, 10)}.xlsx` }
  })

// ---------- Inventory export ----------

const exportInventorySchema = z.object({
  lowStockOnly: z.boolean().optional(),
})

export const exportMyInventory = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(exportInventorySchema)
  .handler(async ({ context, data }) => {
    const storeId = await getOwnedStoreId(context.merchantId)

    const rows = await sql<
      {
        productSku: string
        productName: string
        variantLabel: string
        stockQuantity: number
        lowStockThreshold: number
      }[]
    >`
      SELECT p.sku AS product_sku, p.name AS product_name, v.label AS variant_label,
             v.stock_quantity, v.low_stock_threshold
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE p.store_id = ${storeId}
        AND (${data.lowStockOnly ?? false} = false OR v.stock_quantity <= v.low_stock_threshold)
      ORDER BY p.name ASC, v.label ASC
    `

    const headers = ['SKU', 'Produit', 'Variante', 'Stock', 'Seuil bas']
    const dataRows = rows.map((r) => [
      r.productSku,
      r.productName,
      r.variantLabel,
      r.stockQuantity,
      r.lowStockThreshold,
    ])

    const base64 = buildXlsxBase64(headers, dataRows, 'Inventaire')
    return { base64, filename: `algerbot-inventaire-${new Date().toISOString().slice(0, 10)}.xlsx` }
  })
