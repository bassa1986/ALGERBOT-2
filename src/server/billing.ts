import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware, adminAuthMiddleware } from '~/lib/auth'
import { presignPrivateProofUpload, presignPrivateGet, StorageValidationError } from '~/lib/storage'
import { mutationRateLimit, readRateLimit, uploadRateLimit } from '~/lib/rate-limit'

// ---------- Merchant: subscription status + BaridiMob RIB display ----------

export interface SubscriptionStatus {
  currentPeriodExpiresAt: Date
  isExpired: boolean
  monthlyPriceCentimes: number
}

export const getMySubscriptionStatus = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }): Promise<SubscriptionStatus> => {
    const rows = await sql<{ currentPeriodExpiresAt: Date }[]>`
      SELECT current_period_expires_at FROM subscriptions WHERE merchant_id = ${context.merchantId}
    `
    const settingsRows = await sql<{ monthlyPriceCentimes: number }[]>`
      SELECT monthly_price_centimes FROM subscription_settings WHERE id = true
    `
    const sub = rows[0]
    if (!sub) throw new Error('Abonnement introuvable')

    return {
      currentPeriodExpiresAt: sub.currentPeriodExpiresAt,
      isExpired: sub.currentPeriodExpiresAt.getTime() < Date.now(),
      monthlyPriceCentimes: settingsRows[0]?.monthlyPriceCentimes ?? 0,
    }
  })

/**
 * Public-to-merchant (but auth-required) info needed to make a BaridiMob
 * transfer: platform RIB and account name, read from env at request time.
 */
export const getBaridiMobPaymentInfo = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async () => {
    const rib = process.env.BARIDIMOB_RIB
    const accountName = process.env.BARIDIMOB_ACCOUNT_NAME
    if (!rib || !accountName) {
      throw new Error('Informations de paiement BaridiMob non configurées')
    }
    return { rib, accountName }
  })

// ---------- Merchant: submit a billing proof ----------

const requestProofUploadSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  sizeBytes: z.number().int().positive(),
})

export const requestBillingProofUploadUrl = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, uploadRateLimit])
  .validator(requestProofUploadSchema)
  .handler(async ({ context, data }) => {
    try {
      const result = await presignPrivateProofUpload({
        merchantId: context.merchantId,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      })
      return { ok: true as const, ...result }
    } catch (err) {
      if (err instanceof StorageValidationError) {
        return { ok: false as const, error: err.message }
      }
      throw err
    }
  })

const submitProofSchema = z.object({
  storageKey: z.string().min(1).max(300),
  transactionReference: z.string().min(1).max(200),
  declaredAmountCentimes: z.number().int().min(0),
})

export const submitBillingProof = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(submitProofSchema)
  .handler(async ({ context, data }) => {
    // Defensive check: the storage key must actually be namespaced under
    // this merchant's own private prefix (as presignPrivateProofUpload
    // constructs it), so a merchant can't register a proof row pointing at
    // another merchant's uploaded file.
    if (!data.storageKey.startsWith(`private/billing-proofs/${context.merchantId}/`)) {
      throw new Error('Fichier invalide')
    }

    const rows = await sql<{ id: string }[]>`
      INSERT INTO billing_proofs (merchant_id, storage_key, transaction_reference, declared_amount_centimes)
      VALUES (${context.merchantId}, ${data.storageKey}, ${data.transactionReference}, ${data.declaredAmountCentimes})
      RETURNING id
    `
    return { id: rows[0].id }
  })

export interface BillingProofRow {
  id: string
  transactionReference: string
  declaredAmountCentimes: number
  status: string
  rejectionReason: string | null
  createdAt: Date
  reviewedAt: Date | null
}

export const listMyBillingProofs = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }): Promise<BillingProofRow[]> => {
    return sql<BillingProofRow[]>`
      SELECT id, transaction_reference, declared_amount_centimes, status, rejection_reason, created_at, reviewed_at
      FROM billing_proofs
      WHERE merchant_id = ${context.merchantId}
      ORDER BY created_at DESC
    `
  })

// ---------- Admin: billing queue ----------

export interface AdminBillingProofRow {
  id: string
  merchantId: string
  merchantName: string | null
  telegramUsername: string | null
  transactionReference: string
  declaredAmountCentimes: number
  status: string
  createdAt: Date
}

const listQueueSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

export const listBillingQueue = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .validator(listQueueSchema)
  .handler(async ({ data }): Promise<AdminBillingProofRow[]> => {
    return sql<AdminBillingProofRow[]>`
      SELECT
        bp.id, bp.merchant_id, m.full_name AS merchant_name, m.telegram_username,
        bp.transaction_reference, bp.declared_amount_centimes, bp.status, bp.created_at
      FROM billing_proofs bp
      JOIN merchants m ON m.id = bp.merchant_id
      WHERE (${data.status ?? 'pending'} = 'pending' AND bp.status = 'pending')
         OR (${data.status ?? null}::text IS NOT NULL AND bp.status = ${data.status ?? null})
      ORDER BY bp.created_at ASC
    `
  })

/**
 * Short-lived presigned GET for an admin to view a proof file. Requires an
 * active admin session (enforced by adminAuthMiddleware) before signing —
 * this is the only path by which a private billing-proof object is ever
 * made viewable, and the URL itself expires quickly.
 */
export const getBillingProofViewUrl = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .validator(z.object({ proofId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const rows = await sql<{ storageKey: string }[]>`
      SELECT storage_key FROM billing_proofs WHERE id = ${data.proofId}
    `
    const proof = rows[0]
    if (!proof) throw new Error('Preuve introuvable')

    const url = await presignPrivateGet(proof.storageKey, 300)
    return { url }
  })

const approveSchema = z.object({ proofId: z.string().uuid() })

export const approveBillingProof = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, mutationRateLimit])
  .validator(approveSchema)
  .handler(async ({ context, data }) => {
    await sql.begin(async (tx) => {
      const rows = await tx<{ merchantId: string; status: string }[]>`
        SELECT merchant_id, status FROM billing_proofs WHERE id = ${data.proofId} FOR UPDATE
      `
      const proof = rows[0]
      if (!proof) throw new Error('Preuve introuvable')
      if (proof.status !== 'pending') throw new Error('Cette preuve a déjà été traitée')

      await tx`
        UPDATE billing_proofs SET status = 'approved', reviewed_by_admin_id = ${context.adminId}, reviewed_at = now()
        WHERE id = ${data.proofId}
      `

      // Extend one month from the current expiry (not from now), per spec —
      // so early renewal doesn't lose time, and a lapsed subscription
      // extends from whenever it actually expired rather than from today.
      await tx`
        UPDATE subscriptions
        SET current_period_expires_at = current_period_expires_at + interval '1 month',
            updated_at = now()
        WHERE merchant_id = ${proof.merchantId}
      `
    })
    return { ok: true }
  })

const rejectSchema = z.object({ proofId: z.string().uuid(), reason: z.string().min(1).max(500) })

export const rejectBillingProof = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, mutationRateLimit])
  .validator(rejectSchema)
  .handler(async ({ context, data }) => {
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM billing_proofs WHERE id = ${data.proofId}
    `
    if (!rows[0]) throw new Error('Preuve introuvable')
    if (rows[0].status !== 'pending') throw new Error('Cette preuve a déjà été traitée')

    await sql`
      UPDATE billing_proofs SET
        status = 'rejected', rejection_reason = ${data.reason},
        reviewed_by_admin_id = ${context.adminId}, reviewed_at = now()
      WHERE id = ${data.proofId}
    `
    return { ok: true }
  })




// ---------- Public: pricing info for the homepage/pricing page ----------
export interface PublicPricingInfo {
  monthlyPriceCentimes: number
  freeTrialDays: number
}

export const getPublicPricingInfo = createServerFn({ method: 'GET' })
  .middleware([readRateLimit])
  .handler(async (): Promise<PublicPricingInfo> => {
    const rows = await sql<{ monthlyPriceCentimes: number; freeTrialDays: number }[]>`
      SELECT monthly_price_centimes, free_trial_days FROM subscription_settings WHERE id = true
    `
    const row = rows[0]
    return {
      monthlyPriceCentimes: row?.monthlyPriceCentimes ?? 250000,
      freeTrialDays: row?.freeTrialDays ?? 15,
    }
  })
