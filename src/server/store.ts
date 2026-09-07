import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware, getOptionalMerchantSession } from '~/lib/auth'
import { mutationRateLimit, readRateLimit, publicReadRateLimit } from '~/lib/rate-limit'
import { THEME_IDS } from '~/lib/store-themes'

export type StoreLayoutVariant = 'general' | 'fashion' | 'grocery' | 'electronics' | 'furniture'

export interface StoreRow {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  baseWilayaCode: number | null
  baseCommuneCode: number | null
  googleMapsUrl: string | null
  themeId: string | null
  isPublished: boolean
  layoutVariant: StoreLayoutVariant
}

export const getMyStore = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }): Promise<StoreRow | null> => {
    const rows = await sql<StoreRow[]>`
      SELECT id, slug, name, description, logo_url, banner_url, base_wilaya_code, base_commune_code,
             google_maps_url, theme_id, is_published, layout_variant
      FROM stores
      WHERE merchant_id = ${context.merchantId}
    `
    return rows[0] ?? null
  })

/**
 * Public, non-throwing variant used on buyer-facing pages (e.g. the shop
 * page) to decide whether the current visitor happens to be the merchant
 * who owns what they're looking at. Unlike getMyStore, this never rejects
 * an anonymous visitor — it just returns null, since most viewers of a
 * public shop page won't be logged in at all.
 */
export const getCurrentMerchantId = createServerFn({ method: 'GET' })
  .middleware([publicReadRateLimit])
  .handler(async (): Promise<string | null> => {
    const session = await getOptionalMerchantSession()
    return session?.merchantId ?? null
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
  baseWilayaCode: z.number().int().min(1).max(69).optional(),
  baseCommuneCode: z.number().int().min(1).max(9999).optional(),
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

    // A commune only makes sense paired with its own wilaya — if the
    // caller sent a commune without a wilaya, drop the orphaned commune
    // rather than let the FK constraint below fail confusingly.
    const baseCommuneCode = data.baseWilayaCode ? (data.baseCommuneCode ?? null) : null

    const slug = await generateUniqueSlug(data.name)

    const rows = await sql<StoreRow[]>`
      INSERT INTO stores (merchant_id, slug, name, description, base_wilaya_code, base_commune_code)
      VALUES (
        ${context.merchantId}, ${slug}, ${data.name}, ${data.description ?? null},
        ${data.baseWilayaCode ?? null}, ${baseCommuneCode}
      )
      RETURNING id, slug, name, description, logo_url, banner_url, base_wilaya_code, base_commune_code,
                is_published, layout_variant
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
  baseWilayaCode: z.number().int().min(1).max(69).nullable().optional(),
  baseCommuneCode: z.number().int().min(1).max(9999).nullable().optional(),
  // Loosely validated as a URL only (not restricted to a maps.google.com
  // domain check) — Google's own "Share" button can produce several
  // different host forms (maps.app.goo.gl, google.com/maps/place/...,
  // g.co/kgs/...), and rejecting a legitimate one a merchant pasted would
  // be worse than accepting any well-formed URL here.
  googleMapsUrl: z.string().url().max(500).nullable().optional(),
  // Restricted to the curated preset ids (src/lib/store-themes.ts), never
  // a free-form string — a merchant can only pick one of the pre-made
  // themes, never inject an arbitrary value into this column.
  themeId: z.enum(THEME_IDS).nullable().optional(),
  isPublished: z.boolean().optional(),
  layoutVariant: z.enum(['general', 'fashion', 'grocery', 'electronics', 'furniture']).optional(),
})

export const updateMyStore = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(updateStoreSchema)
  .handler(async ({ context, data }) => {
    // Re-fetch to confirm ownership and get the current row before a
    // partial update — this store's id is never taken from client input.
    const existingRows = await sql<
      { id: string; baseWilayaCode: number | null; baseCommuneCode: number | null }[]
    >`
      SELECT id, base_wilaya_code, base_commune_code FROM stores WHERE merchant_id = ${context.merchantId}
    `
    const existing = existingRows[0]
    if (!existing) throw new Error('Boutique introuvable')

    // A store must declare BOTH its wilaya and its commune (the physical
    // location) before it can go live: buyers filter the marketplace by
    // wilaya/commune, so an incomplete location is invisible to that
    // filter. Checked against the RESULTING values (this call's, if
    // provided, else the existing ones) so "set location AND publish in
    // the same save" still works.
    const resultingWilayaCode = data.baseWilayaCode !== undefined ? data.baseWilayaCode : existing.baseWilayaCode
    // If the wilaya is changing this call and no new commune was sent
    // alongside it, the old commune (which belonged to the old wilaya)
    // can no longer be valid — treat it as cleared rather than let a
    // stale cross-wilaya commune slip through.
    const wilayaIsChanging = data.baseWilayaCode !== undefined && data.baseWilayaCode !== existing.baseWilayaCode
    const resultingCommuneCode =
      data.baseCommuneCode !== undefined
        ? data.baseCommuneCode
        : wilayaIsChanging
          ? null
          : existing.baseCommuneCode

    if (data.isPublished === true && (resultingWilayaCode === null || resultingCommuneCode === null)) {
      throw new Error(
        'Veuillez indiquer la wilaya et la commune où se trouve votre boutique (emplacement physique) avant de la publier.',
      )
    }

    const rows = await sql<StoreRow[]>`
      UPDATE stores SET
        name = COALESCE(${data.name ?? null}, name),
        description = CASE WHEN ${data.description !== undefined} THEN ${data.description ?? null} ELSE description END,
        logo_url = CASE WHEN ${data.logoUrl !== undefined} THEN ${data.logoUrl ?? null} ELSE logo_url END,
        banner_url = CASE WHEN ${data.bannerUrl !== undefined} THEN ${data.bannerUrl ?? null} ELSE banner_url END,
        base_wilaya_code = CASE WHEN ${data.baseWilayaCode !== undefined} THEN ${data.baseWilayaCode ?? null} ELSE base_wilaya_code END,
        base_commune_code = ${resultingCommuneCode},
        google_maps_url = CASE WHEN ${data.googleMapsUrl !== undefined} THEN ${data.googleMapsUrl ?? null} ELSE google_maps_url END,
        theme_id = CASE WHEN ${data.themeId !== undefined} THEN ${data.themeId ?? null} ELSE theme_id END,
        is_published = COALESCE(${data.isPublished ?? null}, is_published),
        layout_variant = COALESCE(${data.layoutVariant ?? null}, layout_variant),
        updated_at = now()
      WHERE id = ${existing.id}
      RETURNING id, slug, name, description, logo_url, banner_url, base_wilaya_code, base_commune_code,
                google_maps_url, theme_id, is_published, layout_variant
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
        wilayaCode: z.number().int().min(1).max(69),
        feeCentimes: z.number().int().min(0),
      }),
    )
    .max(69),
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



