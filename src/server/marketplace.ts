import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db.server'
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
}

const searchSchema = z.object({
  q: z.string().max(120).optional(),
  categorySlug: z.string().optional(),
})

export const searchMarketplaceProducts = createServerFn({ method: 'GET' })
  .middleware([publicRateLimit])
  .validator(searchSchema)
  .handler(async ({ data }): Promise<MarketplaceProductCard[]> => {
    const searchPattern = sanitizeSearchInput(data.q)

    const products = await sql<
      { id: string; name: string; priceCentimes: number; storeSlug: string; storeName: string }[]
    >`
      SELECT p.id, p.name, p.price_centimes, s.slug AS store_slug, s.name AS store_name
      FROM products p
      JOIN stores s ON s.id = p.store_id
      JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_published = true
        AND s.is_published = true
        AND sub.current_period_expires_at > now()
        AND (${searchPattern}::text IS NULL OR p.name ILIKE ${searchPattern})
        AND (${data.categorySlug ?? null}::text IS NULL OR c.slug = ${data.categorySlug ?? null})
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

