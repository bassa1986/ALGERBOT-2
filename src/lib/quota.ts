import { sql } from '~/lib/db'
import { getPlanLimits } from '~/lib/plans'

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
 * Enforces, in order: subscription/trial validity, the merchant's plan's
 * storage quota (skipped entirely if the plan has no storage_limit_bytes,
 * e.g. Starter/Advanced), and — for new-product creation only — the
 * plan's product count cap (skipped entirely for Enterprise's NULL
 * max_products). Reuses the EXISTING subscriptions.current_period_expires_at
 * as the single source of truth for trial/paid status.
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

  const merchantRows = await sql<{ planId: string; currentStorageUsedBytes: number }[]>`
    SELECT plan_id AS "planId", current_storage_used_bytes AS "currentStorageUsedBytes"
    FROM merchants WHERE id = ${merchantId}
  `
  const merchant = merchantRows[0]
  if (!merchant) throw new Error('Merchant not found')

  const plan = await getPlanLimits(merchant.planId)

  if (plan.storageLimitBytes !== null) {
    const projectedUsage = merchant.currentStorageUsedBytes + (opts.additionalBytes ?? 0)
    if (projectedUsage > plan.storageLimitBytes) {
      throw new StorageQuotaExceededError(projectedUsage, plan.storageLimitBytes)
    }
  }

  if (opts.isNewProduct && plan.maxProducts !== null) {
    const countRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE s.merchant_id = ${merchantId}
    `
    const current = parseInt(countRows[0].count, 10)
    if (current >= plan.maxProducts) {
      throw new ProductLimitExceededError(current, plan.maxProducts)
    }
  }
}

/**
 * Atomically checks the storage quota against the REAL current usage and
 * reserves `additionalBytes` against it, in one transaction with the
 * merchant row locked (SELECT ... FOR UPDATE) for the duration. Replaces
 * the previous assertWithinQuota(...) + adjustStorageUsage(...) pair used
 * for image uploads, which read-then-wrote with no lock in between — two
 * concurrent uploads from the same merchant could both pass the check
 * against the same starting value and both proceed, letting usage overshoot
 * the plan's cap (M5). If the caller's own follow-up work (e.g. the Adex
 * PUT) then fails, it should roll back with adjustStorageUsage(merchantId,
 * -additionalBytes).
 */
export async function reserveStorageQuota(merchantId: string, additionalBytes: number): Promise<void> {
  const subRows = await sql<{ currentPeriodExpiresAt: Date }[]>`
    SELECT current_period_expires_at AS "currentPeriodExpiresAt"
    FROM subscriptions WHERE merchant_id = ${merchantId}
  `
  const sub = subRows[0]
  if (!sub || sub.currentPeriodExpiresAt.getTime() < Date.now()) {
    throw new TrialExpiredError()
  }

  await sql.begin(async (tx) => {
    const merchantRows = await tx<{ planId: string; currentStorageUsedBytes: number }[]>`
      SELECT plan_id AS "planId", current_storage_used_bytes AS "currentStorageUsedBytes"
      FROM merchants WHERE id = ${merchantId} FOR UPDATE
    `
    const merchant = merchantRows[0]
    if (!merchant) throw new Error('Merchant not found')

    const plan = await getPlanLimits(merchant.planId)

    if (plan.storageLimitBytes !== null) {
      const projectedUsage = merchant.currentStorageUsedBytes + additionalBytes
      if (projectedUsage > plan.storageLimitBytes) {
        throw new StorageQuotaExceededError(projectedUsage, plan.storageLimitBytes)
      }
    }

    await tx`
      UPDATE merchants
      SET current_storage_used_bytes = GREATEST(0, current_storage_used_bytes + ${additionalBytes})
      WHERE id = ${merchantId}
    `
  })
}

/**
 * Adjusts the merchant's running storage total. Pass a negative delta on
 * deletion. Safe to call even for plans with no storage limit — the
 * column is still tracked for all merchants (useful for admin visibility
 * and in case a merchant later moves to a plan that does cap storage).
 */
export async function adjustStorageUsage(merchantId: string, deltaBytes: number): Promise<void> {
  await sql`
    UPDATE merchants
    SET current_storage_used_bytes = GREATEST(0, current_storage_used_bytes + ${deltaBytes})
    WHERE id = ${merchantId}
  `
}
