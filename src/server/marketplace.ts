import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { sanitizeSearchInput } from '~/lib/sanitize'
import { publicRateLimit } from '~/lib/rate-limit'

// Marketplace-wide (cross-store) browsing — distinct from storefront-public.ts,
// which is scoped to one store. Same visibility rule: store must be
// published AND have an active subscription.

export interface MarketplaceStoreCard {
  slug: string
  name: string
  logoUrl: string | null
  bannerUrl: string | null
}

export const listMarketplaceStores = createServerFn({ method: 'GET' }).middleware([publicRateLimit])
  .handler(
  async (): Promise<MarketplaceStoreCard[]> => {
    return sql<MarketplaceStoreCard[]>`
      SELECT s.slug, s.name, s.logo_url, s.banner_url
      FROM stores s
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      WHERE s.is_published = true AND sub.current_period_expires_at > now()
      ORDER BY s.created_at DESC
      LIMIT 60
    `
  },
)

export interface MarketplaceProductCard {
  id: string
  name: string
  priceCentimes: number
  coverImageUrl: string | null
  storeSlug: string
  storeName: string
  communeNameAr: string | null
  communeNameFr: string | null
  createdAt: Date
}

const searchSchema = z.object({
  q: z.string().max(120).optional(),
  categorySlug: z.string().max(120).optional(),
  wilayaCode: z.number().int().min(1).max(69).optional(),
  communeCode: z.number().int().min(1).max(9999).optional(),
})

export const searchMarketplaceProducts = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(searchSchema)
  .handler(async ({ data }): Promise<MarketplaceProductCard[]> => {
    const searchPattern = sanitizeSearchInput(data.q)

    const products = await sql<
      {
        id: string
        name: string
        priceCentimes: number
        storeSlug: string
        storeName: string
        communeNameAr: string | null
        communeNameFr: string | null
        createdAt: Date
      }[]
    >`
      SELECT
        p.id, p.name, p.price_centimes, s.slug AS store_slug, s.name AS store_name,
        cm.name_ar AS commune_name_ar, cm.name_fr AS commune_name_fr, p.created_at
      FROM products p
      JOIN stores s ON s.id = p.store_id
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN communes cm ON cm.wilaya_code = s.base_wilaya_code AND cm.code = s.base_commune_code
      WHERE p.is_published = true
        AND s.is_published = true
        AND sub.current_period_expires_at > now()
        AND (${searchPattern}::text IS NULL OR p.name ILIKE ${searchPattern})
        AND (${data.categorySlug ?? null}::text IS NULL OR c.slug = ${data.categorySlug ?? null})
        AND (${data.wilayaCode ?? null}::int IS NULL OR s.base_wilaya_code = ${data.wilayaCode ?? null})
        AND (${data.communeCode ?? null}::int IS NULL OR s.base_commune_code = ${data.communeCode ?? null})
      ORDER BY p.created_at DESC
      LIMIT 60
    `

    if (products.length === 0) return []

    const imageRows = await sql<{ productId: string; url: string; isCover: boolean }[]>`
      SELECT product_id, url, is_cover FROM product_images
      WHERE product_id = ANY(${products.map((p) => p.id)})
      ORDER BY sort_order ASC
    `
    const coverByProduct = new Map<string, string>()
    for (const img of imageRows) {
      if (!coverByProduct.has(img.productId) || img.isCover) {
        coverByProduct.set(img.productId, img.url)
      }
    }

    return products.map((p) => ({ ...p, coverImageUrl: coverByProduct.get(p.id) ?? null }))
  })

export interface MarketplaceCategory {
  slug: string
  nameAr: string
  nameFr: string
}

/** Only categories with at least one published product across the whole marketplace. */
export const listMarketplaceCategoriesInUse = createServerFn({ method: 'GET' }).middleware([publicRateLimit])
  .handler(
  async (): Promise<MarketplaceCategory[]> => {
    return sql<MarketplaceCategory[]>`
      SELECT DISTINCT c.slug, c.name_ar, c.name_fr
      FROM categories c
      JOIN products p ON p.category_id = c.id
      JOIN stores s ON s.id = p.store_id
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      WHERE p.is_published = true AND s.is_published = true AND sub.current_period_expires_at > now()
      ORDER BY c.slug
    `
  },
)

export interface MarketplaceWilaya {
  code: number
  nameAr: string
  nameFr: string
}

/** Only wilayas that have at least one published, active-subscription store based there. */
export const listMarketplaceWilayasInUse = createServerFn({ method: 'GET' }).middleware([publicRateLimit])
  .handler(
  async (): Promise<MarketplaceWilaya[]> => {
    return sql<MarketplaceWilaya[]>`
      SELECT DISTINCT w.code, w.name_ar, w.name_fr
      FROM wilayas w
      JOIN stores s ON s.base_wilaya_code = w.code
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      WHERE s.is_published = true AND sub.current_period_expires_at > now()
      ORDER BY w.code
    `
  },
)

export interface MarketplaceCommune {
  code: number
  nameAr: string
  nameFr: string
}

/**
 * Only communes, within one wilaya, that have at least one published,
 * active-subscription store based there. Scoped to a wilaya (rather than
 * returned all at once) both because a commune code is only meaningful
 * within its wilaya and because the homepage filter only needs this list
 * once the buyer has already picked a wilaya.
 */
export const listMarketplaceCommunesInUse = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(z.object({ wilayaCode: z.number().int().min(1).max(69) }))
  .handler(async ({ data }): Promise<MarketplaceCommune[]> => {
    return sql<MarketplaceCommune[]>`
      SELECT DISTINCT c.code, c.name_ar, c.name_fr
      FROM communes c
      JOIN stores s ON s.base_wilaya_code = c.wilaya_code AND s.base_commune_code = c.code
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      WHERE c.wilaya_code = ${data.wilayaCode} AND s.is_published = true AND sub.current_period_expires_at > now()
      ORDER BY c.code
    `
  })


