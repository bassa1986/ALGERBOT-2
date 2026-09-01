import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware, adminAuthMiddleware } from '~/lib/auth'
import { mutationRateLimit, readRateLimit } from '~/lib/rate-limit'
import { listAllPlans } from '~/lib/plans'

// ---------- Merchant: current plan + request an upgrade/downgrade ----------

export interface MyPlanInfo {
  planId: string
  planName: string
  monthlyPriceCentimes: number
  maxProducts: number | null
  storageLimitBytes: number | null
  pendingRequest: { id: string; requestedPlanId: string; requestedPlanName: string } | null
}

export const getMyPlan = createServerFn({ method: 'GET' })
  .middleware([merchantAuthMiddleware, readRateLimit])
  .handler(async ({ context }): Promise<MyPlanInfo> => {
    const rows = await sql<{
      planId: string
      planName: string
      monthlyPriceCentimes: number
      maxProducts: number | null
      storageLimitBytes: number | null
    }[]>`
      SELECT p.id AS "planId", p.name AS "planName", p.monthly_price_centimes AS "monthlyPriceCentimes",
             p.max_products AS "maxProducts", p.storage_limit_bytes AS "storageLimitBytes"
      FROM merchants m JOIN plans p ON p.id = m.plan_id
      WHERE m.id = ${context.merchantId}
    `
    const plan = rows[0]
    if (!plan) throw new Error('Merchant or plan not found')

    const pendingRows = await sql<{ id: string; requestedPlanId: string; requestedPlanName: string }[]>`
      SELECT r.id, r.requested_plan_id AS "requestedPlanId", p.name AS "requestedPlanName"
      FROM plan_change_requests r JOIN plans p ON p.id = r.requested_plan_id
      WHERE r.merchant_id = ${context.merchantId} AND r.status = 'pending'
    `

    return { ...plan, pendingRequest: pendingRows[0] ?? null }
  })

const requestPlanChangeSchema = z.object({
  requestedPlanId: z.string().min(1),
  note: z.string().max(500).optional(),
})

export const requestPlanChange = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(requestPlanChangeSchema)
  .handler(async ({ context, data }) => {
    const merchantRows = await sql<{ planId: string }[]>`
      SELECT plan_id AS "planId" FROM merchants WHERE id = ${context.merchantId}
    `
    const merchant = merchantRows[0]
    if (!merchant) throw new Error('Marchand introuvable')

    if (merchant.planId === data.requestedPlanId) {
      throw new Error('Vous êtes déjà sur ce forfait')
    }

    const planRows = await sql<{ id: string }[]>`
      SELECT id FROM plans WHERE id = ${data.requestedPlanId} AND is_active = true
    `
    if (!planRows[0]) throw new Error('Forfait invalide')

    try {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO plan_change_requests (merchant_id, current_plan_id, requested_plan_id, merchant_note)
        VALUES (${context.merchantId}, ${merchant.planId}, ${data.requestedPlanId}, ${data.note ?? null})
        RETURNING id
      `
      return { id: rows[0].id }
    } catch (err) {
      // Unique partial index (one pending request per merchant) violation.
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        throw new Error('Une demande de changement de forfait est déjà en attente')
      }
      throw err
    }
  })

// ---------- Admin: review plan change requests ----------

export interface AdminPlanChangeRequestRow {
  id: string
  merchantId: string
  merchantName: string | null
  telegramUsername: string | null
  currentPlanId: string
  currentPlanName: string
  requestedPlanId: string
  requestedPlanName: string
  merchantNote: string | null
  status: string
  createdAt: Date
}

const listRequestsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

export const listPlanChangeRequests = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .validator(listRequestsSchema)
  .handler(async ({ data }): Promise<AdminPlanChangeRequestRow[]> => {
    return sql<AdminPlanChangeRequestRow[]>`
      SELECT
        r.id, r.merchant_id AS "merchantId", m.full_name AS "merchantName", m.telegram_username AS "telegramUsername",
        r.current_plan_id AS "currentPlanId", cp.name AS "currentPlanName",
        r.requested_plan_id AS "requestedPlanId", rp.name AS "requestedPlanName",
        r.merchant_note AS "merchantNote", r.status, r.created_at AS "createdAt"
      FROM plan_change_requests r
      JOIN merchants m ON m.id = r.merchant_id
      JOIN plans cp ON cp.id = r.current_plan_id
      JOIN plans rp ON rp.id = r.requested_plan_id
      WHERE (${data.status ?? 'pending'} = 'pending' AND r.status = 'pending')
         OR (${data.status ?? null}::text IS NOT NULL AND r.status = ${data.status ?? null})
      ORDER BY r.created_at ASC
    `
  })

export const approvePlanChangeRequest = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, mutationRateLimit])
  .validator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await sql.begin(async (tx) => {
      const rows = await tx<{ merchantId: string; requestedPlanId: string; status: string }[]>`
        SELECT merchant_id AS "merchantId", requested_plan_id AS "requestedPlanId", status
        FROM plan_change_requests WHERE id = ${data.requestId} FOR UPDATE
      `
      const req = rows[0]
      if (!req) throw new Error('Demande introuvable')
      if (req.status !== 'pending') throw new Error('Cette demande a déjà été traitée')

      await tx`
        UPDATE plan_change_requests
        SET status = 'approved', reviewed_by_admin_id = ${context.adminId}, reviewed_at = now()
        WHERE id = ${data.requestId}
      `
      await tx`
        UPDATE merchants SET plan_id = ${req.requestedPlanId}, updated_at = now()
        WHERE id = ${req.merchantId}
      `
    })
    return { ok: true }
  })

const rejectRequestSchema = z.object({ requestId: z.string().uuid(), reason: z.string().min(1).max(500) })

export const rejectPlanChangeRequest = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, mutationRateLimit])
  .validator(rejectRequestSchema)
  .handler(async ({ context, data }) => {
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM plan_change_requests WHERE id = ${data.requestId}
    `
    if (!rows[0]) throw new Error('Demande introuvable')
    if (rows[0].status !== 'pending') throw new Error('Cette demande a déjà été traitée')

    await sql`
      UPDATE plan_change_requests SET
        status = 'rejected', rejection_reason = ${data.reason},
        reviewed_by_admin_id = ${context.adminId}, reviewed_at = now()
      WHERE id = ${data.requestId}
    `
    return { ok: true }
  })

// ---------- Admin: plan management (edit price/limits, add/deactivate) ----------

export const listPlansForAdmin = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .handler(async () => listAllPlans())

const upsertPlanSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'ID invalide (lettres minuscules, chiffres, - ou _)'),
  name: z.string().min(1).max(100),
  monthlyPriceCentimes: z.number().int().min(0),
  maxProducts: z.number().int().positive().nullable(),
  maxImagesPerProduct: z.number().int().positive(),
  storageLimitBytes: z.number().int().positive().nullable(),
  trialDays: z.number().int().min(0),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
})

/**
 * Insert-or-update a plan by id. Used both to create a brand-new tier and
 * to edit an existing one from the same admin form — the id field is
 * editable only when creating (the UI disables it once a plan exists).
 */
export const upsertPlan = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, mutationRateLimit])
  .validator(upsertPlanSchema)
  .handler(async ({ data }) => {
    await sql`
      INSERT INTO plans (id, name, monthly_price_centimes, max_products, max_images_per_product,
                          storage_limit_bytes, trial_days, is_active, sort_order)
      VALUES (${data.id}, ${data.name}, ${data.monthlyPriceCentimes}, ${data.maxProducts},
              ${data.maxImagesPerProduct}, ${data.storageLimitBytes}, ${data.trialDays},
              ${data.isActive}, ${data.sortOrder})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        monthly_price_centimes = EXCLUDED.monthly_price_centimes,
        max_products = EXCLUDED.max_products,
        max_images_per_product = EXCLUDED.max_images_per_product,
        storage_limit_bytes = EXCLUDED.storage_limit_bytes,
        trial_days = EXCLUDED.trial_days,
        is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order
    `
    return { ok: true }
  })

/**
 * Soft-disable only — a plan with merchants still assigned to it can't be
 * hard-deleted (FK from merchants.plan_id), and shouldn't be: existing
 * merchants on it keep their limits, it just stops appearing on the
 * public pricing page and as an option for new upgrade requests.
 */
export const setPlanActive = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, mutationRateLimit])
  .validator(z.object({ planId: z.string().min(1), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    await sql`UPDATE plans SET is_active = ${data.isActive} WHERE id = ${data.planId}`
    return { ok: true }
  })
