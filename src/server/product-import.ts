import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware } from '~/lib/auth'
import { mutationRateLimit } from '~/lib/rate-limit'
import { assertWithinQuota, ProductLimitExceededError } from '~/lib/quota'
import { getPlanLimits } from '~/lib/plans'

// ---------- Row-level validation ----------

export interface ParsedRow {
  rowNumber: number // 1-based, matching the spreadsheet's row (header = row 1)
  sku: string
  name: string
  description: string
  priceCentimes: number
  categorySlug: string
  variantLabel: string
  variantStock: number
  variantPriceDeltaCentimes: number
}

export interface RowError {
  rowNumber: number
  message: string
}

interface ParseResult {
  validRows: ParsedRow[]
  errors: RowError[]
  categorySlugToId: Map<string, string>
}

async function parseWorkbook(base64: string): Promise<ParseResult> {
  const wb = XLSX.read(base64, { type: 'base64' })
  const sheet = wb.Sheets['Produits'] ?? wb.Sheets[wb.SheetNames[0]]
  if (!sheet) {
    return {
      validRows: [],
      errors: [{ rowNumber: 0, message: 'Feuille "Produits" introuvable' }],
      categorySlugToId: new Map(),
    }
  }

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  const categories = await sql<{ id: string; slug: string }[]>`SELECT id, slug FROM categories`
  const categorySlugToId = new Map(categories.map((c) => [c.slug, c.id]))

  const validRows: ParsedRow[] = []
  const errors: RowError[] = []

  rows.forEach((row, index) => {
    const rowNumber = index + 2 // +1 for 0-index, +1 for header row
    const sku = String(row['sku'] ?? '').trim()
    const name = String(row['nom'] ?? '').trim()
    const description = String(row['description'] ?? '').trim()
    const priceRaw = row['prix_dzd']
    const categorySlug = String(row['categorie'] ?? '').trim()
    const variantLabel = String(row['variante_libelle'] ?? '').trim()
    const variantStockRaw = row['variante_stock']
    const variantDeltaRaw = row['variante_ajustement_prix_dzd']

    if (!sku) {
      errors.push({ rowNumber, message: 'SKU manquant' })
      return
    }
    if (!name) {
      errors.push({ rowNumber, message: 'Nom manquant' })
      return
    }

    const priceCentimes = Math.round(Number(priceRaw) * 100)
    if (priceRaw === '' || priceRaw === undefined || Number.isNaN(priceCentimes) || priceCentimes < 0) {
      errors.push({ rowNumber, message: 'Prix invalide' })
      return
    }

    if (categorySlug && !categorySlugToId.has(categorySlug)) {
      errors.push({ rowNumber, message: `Catégorie inconnue : "${categorySlug}"` })
      return
    }

    const variantStock =
      variantStockRaw === '' || variantStockRaw === undefined ? 0 : Number(variantStockRaw)
    if (Number.isNaN(variantStock) || variantStock < 0) {
      errors.push({ rowNumber, message: 'Stock de variante invalide' })
      return
    }

    const variantDelta =
      variantDeltaRaw === '' || variantDeltaRaw === undefined
        ? 0
        : Math.round(Number(variantDeltaRaw) * 100)
    if (Number.isNaN(variantDelta)) {
      errors.push({ rowNumber, message: 'Ajustement de prix de variante invalide' })
      return
    }

    validRows.push({
      rowNumber,
      sku,
      name,
      description,
      priceCentimes,
      categorySlug,
      variantLabel,
      variantStock,
      variantPriceDeltaCentimes: variantDelta,
    })
  })

  return { validRows, errors, categorySlugToId }
}

// ---------- Preview (parse + validate, no writes) ----------

const previewSchema = z.object({ base64: z.string().min(1) })

export const previewProductImport = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(previewSchema)
  .handler(async ({ data }) => {
    const { validRows, errors } = await parseWorkbook(data.base64)
    return {
      totalRows: validRows.length + errors.length,
      validCount: validRows.length,
      errorCount: errors.length,
      errors,
      // Full validation already ran above; the client only needs a sample
      // to render the preview table, so cap what's sent back.
      previewRows: validRows.slice(0, 50),
    }
  })

// ---------- Confirm (re-parse + write, bulk upsert by SKU) ----------

const confirmSchema = z.object({ base64: z.string().min(1) })

export const confirmProductImport = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(confirmSchema)
  .handler(async ({ context, data }) => {
    // Re-parse rather than trusting a client-echoed row list, so what
    // actually gets written is always re-validated against the current
    // category list, not a stale preview payload.
    const { validRows, errors, categorySlugToId } = await parseWorkbook(data.base64)
    if (validRows.length === 0) {
      return { ok: false as const, errors, upsertedProducts: 0, upsertedVariants: 0 }
    }

    const storeRows = await sql<{ id: string }[]>`
      SELECT id FROM stores WHERE merchant_id = ${context.merchantId}
    `
    const store = storeRows[0]
    if (!store) throw new Error('Boutique introuvable')

    // Group rows by SKU: a product can have multiple variant rows sharing
    // the same sku/nom/prix, as shown in the template's example rows.
    const bySku = new Map<string, ParsedRow[]>()
    for (const row of validRows) {
      const list = bySku.get(row.sku) ?? []
      list.push(row)
      bySku.set(row.sku, list)
    }

    // Enforce the same trial/subscription validity check single-product
    // creation gets (createMyProduct in products.ts) — an expired trial
    // shouldn't be able to bulk-import either. This call alone doesn't
    // cover the product-count cap: assertWithinQuota's isNewProduct mode
    // is shaped for "reject the ONE product about to be added", not "N
    // new products in one batch", so the count check below is separate.
    await assertWithinQuota(context.merchantId)

    const merchantPlanRows = await sql<{ planId: string }[]>`
      SELECT plan_id AS "planId" FROM merchants WHERE id = ${context.merchantId}
    `
    const plan = await getPlanLimits(merchantPlanRows[0].planId)
    if (plan.maxProducts !== null) {
      // Only SKUs not already present for this store count as "new" —
      // re-importing/updating existing SKUs must not itself be blocked
      // by the cap. Checked BEFORE the transaction below, against the
      // FULL batch, so an over-limit import is rejected as a whole
      // rather than partially applying up to the limit and silently
      // dropping the rest.
      const [existingSkuRows, currentCountRows] = await Promise.all([
        sql<{ sku: string }[]>`SELECT sku FROM products WHERE store_id = ${store.id}`,
        sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM products WHERE store_id = ${store.id}`,
      ])
      const existingSkus = new Set(existingSkuRows.map((r) => r.sku))
      const newSkuCount = Array.from(bySku.keys()).filter((sku) => !existingSkus.has(sku)).length
      const currentCount = parseInt(currentCountRows[0].count, 10)

      if (currentCount + newSkuCount > plan.maxProducts) {
        throw new ProductLimitExceededError(currentCount, plan.maxProducts)
      }
    }

    let upsertedProducts = 0
    let upsertedVariants = 0

    await sql.begin(async (tx) => {
      for (const [sku, rowsForSku] of bySku) {
        const first = rowsForSku[0]
        const categoryId = first.categorySlug ? categorySlugToId.get(first.categorySlug) ?? null : null

        const productRows = await tx<{ id: string }[]>`
          INSERT INTO products (store_id, sku, name, description, price_centimes, category_id)
          VALUES (${store.id}, ${sku}, ${first.name}, ${first.description || null}, ${first.priceCentimes}, ${categoryId})
          ON CONFLICT (store_id, sku) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price_centimes = EXCLUDED.price_centimes,
            category_id = EXCLUDED.category_id,
            updated_at = now()
          RETURNING id
        `
        const productId = productRows[0].id
        upsertedProducts += 1

        for (const row of rowsForSku) {
          if (!row.variantLabel) continue // product-only row, no variant

          // Match existing variant by (product_id, label) — variants don't
          // have their own SKU column in the schema, so label is the
          // closest available identity for "is this the same variant".
          const existing = await tx<{ id: string; stockQuantity: number }[]>`
            SELECT id, stock_quantity FROM product_variants
            WHERE product_id = ${productId} AND label = ${row.variantLabel}
          `

          if (existing.length > 0) {
            const variant = existing[0]
            const stockDelta = row.variantStock - variant.stockQuantity
            await tx`
              UPDATE product_variants SET
                price_delta_centimes = ${row.variantPriceDeltaCentimes},
                stock_quantity = ${row.variantStock},
                updated_at = now()
              WHERE id = ${variant.id}
            `
            if (stockDelta !== 0) {
              await tx`
                INSERT INTO inventory_movements (variant_id, delta, reason, note, created_by_merchant_id)
                VALUES (${variant.id}, ${stockDelta}, 'excel_import', ${`Import: ${sku} / ${row.variantLabel}`}, ${context.merchantId})
              `
            }
          } else {
            const newVariant = await tx<{ id: string }[]>`
              INSERT INTO product_variants (product_id, label, price_delta_centimes, stock_quantity)
              VALUES (${productId}, ${row.variantLabel}, ${row.variantPriceDeltaCentimes}, ${row.variantStock})
              RETURNING id
            `
            if (row.variantStock > 0) {
              await tx`
                INSERT INTO inventory_movements (variant_id, delta, reason, note, created_by_merchant_id)
                VALUES (${newVariant[0].id}, ${row.variantStock}, 'excel_import', ${`Import: ${sku} / ${row.variantLabel}`}, ${context.merchantId})
              `
            }
          }
          upsertedVariants += 1
        }
      }
    })

    return { ok: true as const, errors, upsertedProducts, upsertedVariants }
  })



