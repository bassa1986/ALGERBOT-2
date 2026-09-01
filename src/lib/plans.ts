import { sql } from '~/lib/db'

// Raw upload guard and image-processing targets stay as fixed constants —
// they're properties of the optimization pipeline itself, not something
// that varies per pricing tier.
export const IMAGE_MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5MB
export const IMAGE_MAX_DIMENSION = 1200 // px, longest side
export const IMAGE_WEBP_QUALITY = 78 // targets ~150-250KB per photo

export interface PlanLimits {
  id: string
  name: string
  monthlyPriceCentimes: number
  maxProducts: number | null // null = unlimited (Enterprise)
  maxImagesPerProduct: number
  storageLimitBytes: number | null // null = no storage check (Starter, Advanced)
  trialDays: number
  isActive?: boolean // present on admin queries only; absent on the public-facing lookups
}

/**
 * Looks up a single plan's limits by id. Called on every quota check, so
 * this is a small, indexed primary-key lookup — cheap enough not to need
 * an in-process cache for this app's traffic level; revisit if that
 * changes.
 */
export async function getPlanLimits(planId: string): Promise<PlanLimits> {
  const rows = await sql<PlanLimits[]>`
    SELECT id, name, monthly_price_centimes AS "monthlyPriceCentimes",
           max_products AS "maxProducts", max_images_per_product AS "maxImagesPerProduct",
           storage_limit_bytes AS "storageLimitBytes", trial_days AS "trialDays"
    FROM plans WHERE id = ${planId}
  `
  const plan = rows[0]
  if (!plan) throw new Error(`Unknown plan: ${planId}`)
  return plan
}

/** Public list, for the pricing page — only plans marked active/visible. */
export async function listActivePlans(): Promise<PlanLimits[]> {
  return sql<PlanLimits[]>`
    SELECT id, name, monthly_price_centimes AS "monthlyPriceCentimes",
           max_products AS "maxProducts", max_images_per_product AS "maxImagesPerProduct",
           storage_limit_bytes AS "storageLimitBytes", trial_days AS "trialDays"
    FROM plans WHERE is_active = true ORDER BY sort_order ASC
  `
}

/** Admin list — every plan regardless of is_active, for the management UI. */
export async function listAllPlans(): Promise<PlanLimits[]> {
  return sql<PlanLimits[]>`
    SELECT id, name, monthly_price_centimes AS "monthlyPriceCentimes",
           max_products AS "maxProducts", max_images_per_product AS "maxImagesPerProduct",
           storage_limit_bytes AS "storageLimitBytes", trial_days AS "trialDays",
           is_active AS "isActive"
    FROM plans ORDER BY sort_order ASC
  `
}
