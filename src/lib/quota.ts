import { sql } from '~/lib/db'
import { PLAN_MAX_PRODUCTS, PLAN_STORAGE_LIMIT_BYTES } from '~/lib/plans'

// Error .message is the human-readable French string shown directly by
// existing client code (e.g. useProductPhotoUpload.ts's `err.message`
// display), so no changes were needed there to surface these clearly.
// quota-error-messages.ts provides a bilingual (ar/fr) variant for call
// sites that check `instanceof` and want localized text instead.
export class TrialExpiredError extends Error {
  constructor() {
    super("Votre période d'essai ou votre abonnement a expiré. Veuillez payer pour continuer.")
    this.name = 'TrialExpiredError'
  }
}
export class StorageQuotaExceededError extends Error {
  constructor(public usedBytes: number, public limitBytes: number) {
    const usedMb = (usedBytes / 1_048_576).toFixed(1)
    const limitMb = (limitBytes / 1_048_576).toFixed(0)
    super(`Quota de stockage dépassé (${usedMb} / ${limitMb} Mo). Supprimez des images pour continuer.`)
    this.name = 'StorageQuotaExceededError'
  }
}
export class ProductLimitExceededError extends Error {
  constructor(public current: number, public max: number) {
    super(`Limite de ${max} produits atteinte pour votre forfait.`)
    this.name = 'ProductLimitExceededError'
  }
}

/**
 * Enforces, in order: subscription/trial validity, storage quota, and (for
 * new-product creation only) the product count cap. Reuses the EXISTING
 * subscriptions.current_period_expires_at as the single source of truth
 * for trial/paid status — that row is already created at signup with
 * now() + free_trial_days by ensureTrialSubscription, and already gets
 * extended on payment approval, so no new trial-tracking columns are
 * needed for this single-tier setup.
 *
 * Call this from any server function that creates a product or accepts an
 * image upload, before doing the actual work.
 */
export async function assertWithinQuota(
  merchantId: string,
  opts: { additionalBytes?: number; isNewProduct?: boolean } = {},
): Promise<void> {
  const subRows = await sql<{ currentPeriodExpiresAt: Date }[]>`
    SELECT current_period_expires_at AS "currentPeriodExpiresAt"
    FROM subscriptions WHERE merchant_id = ${merchantId}
  `
  const sub = subRows[0]
  if (!sub || sub.currentPeriodExpiresAt.getTime() < Date.now()) {
    throw new TrialExpiredError()
  }

  const merchantRows = await sql<{ currentStorageUsedBytes: number }[]>`
    SELECT current_storage_used_bytes AS "currentStorageUsedBytes"
    FROM merchants WHERE id = ${merchantId}
  `
  const currentUsage = merchantRows[0]?.currentStorageUsedBytes ?? 0
  const projectedUsage = currentUsage + (opts.additionalBytes ?? 0)
  if (projectedUsage > PLAN_STORAGE_LIMIT_BYTES) {
    throw new StorageQuotaExceededError(projectedUsage, PLAN_STORAGE_LIMIT_BYTES)
  }

  if (opts.isNewProduct) {
    const countRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE s.merchant_id = ${merchantId}
    `
    const current = parseInt(countRows[0].count, 10)
    if (current >= PLAN_MAX_PRODUCTS) {
      throw new ProductLimitExceededError(current, PLAN_MAX_PRODUCTS)
    }
  }
}

/**
 * Adjusts the merchant's running storage total. Pass a negative delta on
 * deletion. GREATEST(0, ...) guards against ever going negative from a
 * rounding/race edge case — the true value self-corrects on next upload.
 */
export async function adjustStorageUsage(merchantId: string, deltaBytes: number): Promise<void> {
  await sql`
    UPDATE merchants
    SET current_storage_used_bytes = GREATEST(0, current_storage_used_bytes + ${deltaBytes})
    WHERE id = ${merchantId}
  `
}
