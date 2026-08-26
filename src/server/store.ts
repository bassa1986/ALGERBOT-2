import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware } from '~/lib/auth'
import { mutationRateLimit, readRateLimit } from '~/lib/rate-limit'

export type StoreLayoutVariant = 'general' | 'fashion' | 'grocery' | 'electronics' | 'furniture'

export interface StoreRow {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  baseWilayaCode: number | null
  isPublished: boolean
  layoutVariant: StoreLayoutVariant
}

export const getMyStore = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }): Promise<StoreRow | null> => {
    const rows = await sql<StoreRow[]>`
      SELECT id, slug, name, description, logo_url, banner_url, base_wilaya_code, is_published, layout_variant
      FROM stores
      WHERE merchant_id = ${context.merchantId}
    `
    return rows[0] ?? null
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

async function generateUniqueSlug(base: string): Promise<string> {
  const baseSlug = slugify(base) || 'boutique'
  let candidate = baseSlug
  let suffix = 1
  // Bounded loop: realistically resolves within a handful of iterations;
  // the numeric suffix guarantees termination.
  while (suffix < 1000) {
    const existing = await sql<{ id: string }[]>`SELECT id FROM stores WHERE slug = ${candidate}`
    if (existing.length === 0) return candidate
    suffix += 1
    candidate = `${baseSlug}-${suffix}`
  }
  // Extremely unlikely fallback.
  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`
}

const createStoreSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  baseWilayaCode: z.number().int().min(1).max(58).optional(),
})

/**
 * Creates the merchant's store (first-login onboarding). A merchant has
 * exactly one store — this fails if one already exists, so onboarding is
 * a one-time action; subsequent edits go through updateMyStore.
 */
export const createMyStore = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(createStoreSchema)
  .handler(async ({ context, data }) => {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM stores WHERE merchant_id = ${context.merchantId}
    `
    if (existing.length > 0) {
      throw new Error('Une boutique existe déjà pour ce compte')
    }

    const slug = await generateUniqueSlug(data.name)

    const rows = await sql<StoreRow[]>`
      INSERT INTO stores (merchant_id, slug, name, description, base_wilaya_code)
      VALUES (${context.merchantId}, ${slug}, ${data.name}, ${data.description ?? null}, ${data.baseWilayaCode ?? null})
      RETURNING id, slug, name, description, logo_url, banner_url, base_wilaya_code, is_published, layout_variant
    `

    await sql`
      UPDATE merchants SET onboarding_completed_at = now(), updated_at = now()
      WHERE id = ${context.merchantId}
    `

    return rows[0]
  })

const updateStoreSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  baseWilayaCode: z.number().int().min(1).max(58).nullable().optional(),
  isPublished: z.boolean().optional(),
  layoutVariant: z.enum(['general', 'fashion', 'grocery', 'electronics', 'furniture']).optional(),
})

export const updateMyStore = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(updateStoreSchema)
  .handler(async ({ context, data }) => {
    // Re-fetch to confirm ownership and get the current row before a
    // partial update — this store's id is never taken from client input.
    const existingRows = await sql<{ id: string }[]>`
      SELECT id FROM stores WHERE merchant_id = ${context.merchantId}
    `
    const existing = existingRows[0]
    if (!existing) throw new Error('Boutique introuvable')

    const rows = await sql<StoreRow[]>`
      UPDATE stores SET
        name = COALESCE(${data.name ?? null}, name),
        description = CASE WHEN ${data.description !== undefined} THEN ${data.description ?? null} ELSE description END,
        logo_url = CASE WHEN ${data.logoUrl !== undefined} THEN ${data.logoUrl ?? null} ELSE logo_url END,
        banner_url = CASE WHEN ${data.bannerUrl !== undefined} THEN ${data.bannerUrl ?? null} ELSE banner_url END,
        base_wilaya_code = CASE WHEN ${data.baseWilayaCode !== undefined} THEN ${data.baseWilayaCode ?? null} ELSE base_wilaya_code END,
        is_published = COALESCE(${data.isPublished ?? null}, is_published),
        layout_variant = COALESCE(${data.layoutVariant ?? null}, layout_variant),
        updated_at = now()
      WHERE id = ${existing.id}
      RETURNING id, slug, name, description, logo_url, banner_url, base_wilaya_code, is_published, layout_variant
    `
    return rows[0]
  })

// ---------- Delivery zones (per-wilaya fees) ----------

export interface DeliveryZoneRow {
  wilayaCode: number
  feeCentimes: number
}

export const getMyDeliveryZones = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }): Promise<DeliveryZoneRow[]> => {
    return sql<DeliveryZoneRow[]>`
      SELECT z.wilaya_code, z.fee_centimes
      FROM store_delivery_zones z
      JOIN stores s ON s.id = z.store_id
      WHERE s.merchant_id = ${context.merchantId}
      ORDER BY z.wilaya_code
    `
  })

const setDeliveryZonesSchema = z.object({
  zones: z
    .array(
      z.object({
        wilayaCode: z.number().int().min(1).max(58),
        feeCentimes: z.number().int().min(0),
      }),
    )
    .max(58),
})

/**
 * Replaces the merchant's full set of delivery zones in one transaction.
 * A wilaya omitted from `zones` means "not delivered there" (per schema:
 * absence of a row = no delivery), so this is a full replace, not a merge.
 */
export const setMyDeliveryZones = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(setDeliveryZonesSchema)
  .handler(async ({ context, data }) => {
    const storeRows = await sql<{ id: string }[]>`
      SELECT id FROM stores WHERE merchant_id = ${context.merchantId}
    `
    const store = storeRows[0]
    if (!store) throw new Error('Boutique introuvable')

    await sql.begin(async (tx) => {
      await tx`DELETE FROM store_delivery_zones WHERE store_id = ${store.id}`
      for (const zone of data.zones) {
        await tx`
          INSERT INTO store_delivery_zones (store_id, wilaya_code, fee_centimes)
          VALUES (${store.id}, ${zone.wilayaCode}, ${zone.feeCentimes})
        `
      }
    })

    return { ok: true, count: data.zones.length }
  })
