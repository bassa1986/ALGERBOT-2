import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { adminAuthMiddleware } from '~/lib/auth'
import { csrfMiddleware } from '~/server/admin-auth'
import { sanitizeSearchInput } from '~/lib/sanitize'
import { mutationRateLimit, readRateLimit } from '~/lib/rate-limit'

// ---------- Merchants: list, approve, suspend ----------

export interface AdminMerchantRow {
  id: string
  fullName: string | null
  telegramUsername: string | null
  status: string
  storeName: string | null
  storeSlug: string | null
  subscriptionExpiresAt: Date | null
  createdAt: Date
}

const listMerchantsSchema = z.object({
  status: z.enum(['pending', 'active', 'suspended']).optional(),
  search: z.string().max(120).optional(),
})

export const listMerchants = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .validator(listMerchantsSchema)
  .handler(async ({ data }): Promise<AdminMerchantRow[]> => {
    const searchPattern = sanitizeSearchInput(data.search)
    return sql<AdminMerchantRow[]>`
      SELECT
        m.id, m.full_name, m.telegram_username, m.status,
        s.name AS store_name, s.slug AS store_slug,
        sub.current_period_expires_at AS subscription_expires_at,
        m.created_at
      FROM merchants m
      LEFT JOIN stores s ON s.merchant_id = m.id
      LEFT JOIN subscriptions sub ON sub.merchant_id = m.id
      WHERE (${data.status ?? null}::text IS NULL OR m.status = ${data.status ?? null})
        AND (
          ${searchPattern}::text IS NULL
          OR m.full_name ILIKE ${searchPattern}
          OR m.telegram_username ILIKE ${searchPattern}
          OR s.name ILIKE ${searchPattern}
        )
      ORDER BY m.created_at DESC
      LIMIT 200
    `
  })

const setMerchantStatusSchema = z.object({
  merchantId: z.string().uuid(),
  status: z.enum(['pending', 'active', 'suspended']),
})

export const setMerchantStatus = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, adminAuthMiddleware, mutationRateLimit])
  .validator(setMerchantStatusSchema)
  .handler(async ({ data }) => {
    const rows = await sql<{ id: string }[]>`
      UPDATE merchants SET status = ${data.status}, updated_at = now()
      WHERE id = ${data.merchantId}
      RETURNING id
    `
    if (rows.length === 0) throw new Error('Marchand introuvable')
    return { ok: true }
  })

// ---------- Orders (cross-store, admin view) ----------

export interface AdminOrderRow {
  id: string
  trackingCode: string
  storeName: string
  buyerName: string
  buyerPhone: string
  status: string
  totalCentimes: number
  createdAt: Date
}

const listAllOrdersSchema = z.object({
  status: z.enum(['confirmed', 'packed', 'handed_to_courier', 'delivered', 'paid', 'cancelled']).optional(),
  search: z.string().max(120).optional(),
})

export const listAllOrders = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .validator(listAllOrdersSchema)
  .handler(async ({ data }): Promise<AdminOrderRow[]> => {
    const searchPattern = sanitizeSearchInput(data.search)
    return sql<AdminOrderRow[]>`
      SELECT o.id, o.tracking_code, s.name AS store_name, o.buyer_name, o.buyer_phone,
             o.status, o.total_centimes, o.created_at
      FROM orders o
      JOIN stores s ON s.id = o.store_id
      WHERE (${data.status ?? null}::text IS NULL OR o.status = ${data.status ?? null})
        AND (
          ${searchPattern}::text IS NULL
          OR o.tracking_code ILIKE ${searchPattern}
          OR o.buyer_phone ILIKE ${searchPattern}
          OR s.name ILIKE ${searchPattern}
        )
      ORDER BY o.created_at DESC
      LIMIT 200
    `
  })

// ---------- Global categories ----------

export interface AdminCategoryRow {
  id: string
  slug: string
  nameAr: string
  nameFr: string
  sortOrder: number
}

export const listAllCategories = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .handler(async (): Promise<AdminCategoryRow[]> => {
    return sql<AdminCategoryRow[]>`
      SELECT id, slug, name_ar, name_fr, sort_order FROM categories ORDER BY sort_order ASC
    `
  })

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const createCategorySchema = z.object({
  nameAr: z.string().min(1).max(120),
  nameFr: z.string().min(1).max(120),
  sortOrder: z.number().int().default(0),
})

export const createCategory = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, adminAuthMiddleware, mutationRateLimit])
  .validator(createCategorySchema)
  .handler(async ({ data }) => {
    const baseSlug = slugify(data.nameFr) || 'categorie'
    let slug = baseSlug
    let suffix = 1
    while (suffix < 1000) {
      const existing = await sql<{ id: string }[]>`SELECT id FROM categories WHERE slug = ${slug}`
      if (existing.length === 0) break
      suffix += 1
      slug = `${baseSlug}-${suffix}`
    }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO categories (slug, name_ar, name_fr, sort_order)
      VALUES (${slug}, ${data.nameAr}, ${data.nameFr}, ${data.sortOrder})
      RETURNING id
    `
    return { id: rows[0].id, slug }
  })

const updateCategorySchema = z.object({
  categoryId: z.string().uuid(),
  nameAr: z.string().min(1).max(120).optional(),
  nameFr: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
})

export const updateCategory = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, adminAuthMiddleware, mutationRateLimit])
  .validator(updateCategorySchema)
  .handler(async ({ data }) => {
    await sql`
      UPDATE categories SET
        name_ar = COALESCE(${data.nameAr ?? null}, name_ar),
        name_fr = COALESCE(${data.nameFr ?? null}, name_fr),
        sort_order = COALESCE(${data.sortOrder ?? null}, sort_order)
      WHERE id = ${data.categoryId}
    `
    return { ok: true }
  })

export const deleteCategory = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, adminAuthMiddleware, mutationRateLimit])
  .validator(z.object({ categoryId: z.string().uuid() }))
  .handler(async ({ data }) => {
    // products.category_id has no ON DELETE behavior specified in the
    // migration (defaults to NO ACTION), so deleting a category still in
    // use on any product correctly fails at the DB level — surfaced here
    // as a normal thrown error rather than silently orphaning rows.
    //
    // Hygiene fix: this used to catch ANY thrown error and report "category
    // in use" unconditionally, which would mask a real error (DB
    // connectivity, permissions, etc.) behind a misleading message. Check
    // the specific foreign-key-violation code (23503) — same pattern
    // already used correctly for the admin-singleton unique violation
    // (23505) in admin-auth.ts — and let anything else propagate as-is.
    try {
      await sql`DELETE FROM categories WHERE id = ${data.categoryId}`
    } catch (err) {
      const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : undefined
      if (code === '23503') {
        throw new Error('Impossible de supprimer : catégorie utilisée par des produits')
      }
      throw err
    }
    return { ok: true }
  })

// ---------- Subscription tier price ----------

export const getSubscriptionSettings = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .handler(async () => {
    const rows = await sql<{ monthlyPriceCentimes: number; freeTrialDays: number }[]>`
      SELECT monthly_price_centimes, free_trial_days FROM subscription_settings WHERE id = true
    `
    return rows[0]
  })

const updateSettingsSchema = z.object({
  monthlyPriceCentimes: z.number().int().min(0).optional(),
  freeTrialDays: z.number().int().min(0).optional(),
})

export const updateSubscriptionSettings = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, adminAuthMiddleware, mutationRateLimit])
  .validator(updateSettingsSchema)
  .handler(async ({ data }) => {
    await sql`
      UPDATE subscription_settings SET
        monthly_price_centimes = COALESCE(${data.monthlyPriceCentimes ?? null}, monthly_price_centimes),
        free_trial_days = COALESCE(${data.freeTrialDays ?? null}, free_trial_days),
        updated_at = now()
      WHERE id = true
    `
    return { ok: true }
  })

// ---------- Marketplace stats ----------

export interface MarketplaceStats {
  totalMerchants: number
  activeMerchants: number
  pendingMerchants: number
  totalStores: number
  publishedStores: number
  totalProducts: number
  totalOrders: number
  ordersLast30Days: number
  revenueLast30DaysCentimes: number
  pendingBillingProofs: number
}

export const getMarketplaceStats = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .handler(async (): Promise<MarketplaceStats> => {
    const [merchantCounts, storeCounts, productCount, orderCounts, billingCount] = await Promise.all([
      sql<{ total: string; active: string; pending: string }[]>`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'active')::text AS active,
          COUNT(*) FILTER (WHERE status = 'pending')::text AS pending
        FROM merchants
      `,
      sql<{ total: string; published: string }[]>`
        SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE is_published)::text AS published
        FROM stores
      `,
      sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM products`,
      sql<{ total: string; last30: string; revenue30: string | null }[]>`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::text AS last30,
          SUM(total_centimes) FILTER (
            WHERE created_at > now() - interval '30 days' AND status != 'cancelled'
          )::text AS revenue30
        FROM orders
      `,
      sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM billing_proofs WHERE status = 'pending'`,
    ])

    return {
      totalMerchants: parseInt(merchantCounts[0].total, 10),
      activeMerchants: parseInt(merchantCounts[0].active, 10),
      pendingMerchants: parseInt(merchantCounts[0].pending, 10),
      totalStores: parseInt(storeCounts[0].total, 10),
      publishedStores: parseInt(storeCounts[0].published, 10),
      totalProducts: parseInt(productCount[0].count, 10),
      totalOrders: parseInt(orderCounts[0].total, 10),
      ordersLast30Days: parseInt(orderCounts[0].last30, 10),
      revenueLast30DaysCentimes: parseInt(orderCounts[0].revenue30 ?? '0', 10),
      pendingBillingProofs: parseInt(billingCount[0].count, 10),
    }
  })



