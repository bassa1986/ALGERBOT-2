import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
import { getRequest, getRequestHeader } from '@tanstack/react-start/server'
import { sql } from '~/lib/db'
import { hashPassword, verifyPassword, sha256Hex, generateSessionToken } from '~/lib/crypto'
import { issueSession, revokeCurrentSession, adminAuthMiddleware, getOptionalAdminSession } from '~/lib/auth.server'
import { authRateLimit, readRateLimit } from '~/lib/rate-limit'
import { sendEmail } from '~/lib/email'

interface AdminRow {
  id: string
  passwordHash: string
  fullName: string
  isSuperAdmin: boolean
}

// Computed once per process from a throwaway password, at the same cost as
// real hashes, so a login attempt against a non-existent email takes the
// same time as one against a real email with a wrong password (defeats
// user-enumeration via timing).
let dummyHashPromise: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('dummy-password-for-constant-time-compare')
  }
  return dummyHashPromise
}

// Verifies the request's Origin header matches this app's own origin, to
// defend against cross-site POSTs that SameSite=Lax alone doesn't block
// (e.g. a form POST from a sibling subdomain).
const csrfMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const request = getRequest()
  const origin = request.headers.get('origin')
  const appOrigin = process.env.APP_ORIGIN
  if (appOrigin && origin && new URL(origin).origin !== appOrigin) {
    throw new Error('Origin check failed')
  }
  return next()
})

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const loginAsAdmin = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, authRateLimit])
  .validator(adminLoginSchema)
  .handler(async ({ data }) => {
    const rows = await sql<AdminRow[]>`
      SELECT id, password_hash, full_name, is_super_admin
      FROM admins
      WHERE email = ${data.email.toLowerCase()}
    `
    const admin = rows[0]

    // Always run a password verification, even when the admin doesn't
    // exist, so the two failure paths take the same time.
    const hashToCheck = admin?.passwordHash ?? (await getDummyHash())
    const passwordMatches = await verifyPassword(data.password, hashToCheck)
    const ok = admin != null && passwordMatches

    if (!ok) {
      throw new Error('Email ou mot de passe invalide')
    }

    // Rotate: destroy any existing sessions for this admin, then issue fresh.
    await sql`DELETE FROM sessions WHERE admin_id = ${admin.id}`
    await issueSession({
      adminId: admin.id,
      userAgent: getRequestHeader('user-agent') ?? null,
      ipAddress: getRequestHeader('x-forwarded-for') ?? null,
    })

    return { adminId: admin.id, fullName: admin.fullName, isSuperAdmin: admin.isSuperAdmin }
  })

export const logoutAdmin = createServerFn({ method: 'POST' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .handler(async () => {
    await revokeCurrentSession()
    return { ok: true }
  })

export const getCurrentAdmin = createServerFn({ method: 'GET' })
  .middleware([adminAuthMiddleware, readRateLimit])
  .handler(async ({ context }) => {
    const rows = await sql<{ id: string; email: string; fullName: string; isSuperAdmin: boolean }[]>`
      SELECT id, email, full_name, is_super_admin
      FROM admins
      WHERE id = ${context.adminId}
    `
    return rows[0] ?? null
  })



export const getOptionalAdminSessionFn = createServerFn({ method: 'GET' })
  .middleware([readRateLimit])
  .handler(async () => {
    return getOptionalAdminSession()
  })

// ---------- One-time admin account creation ----------
// This project allows exactly one admin account, ever -- enforced at the
// database level by the admins_singleton_idx unique index (migration
// 0011), so this check-then-insert can't be raced into creating two.
// If the unique index rejects the insert (someone beat this request to
// it), that's surfaced as the same "already exists" error as the
// pre-check below, not a raw constraint-violation message.

const createFirstAdminSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(10).max(200),
  fullName: z.string().min(2).max(120),
})

export const createFirstAdmin = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, authRateLimit])
  .validator(createFirstAdminSchema)
  .handler(async ({ data }) => {
    const existing = await sql<{ id: string }[]>`SELECT id FROM admins LIMIT 1`
    if (existing.length > 0) {
      throw new Error("Un compte administrateur existe déjà -- une seule création est autorisée.")
    }

    const passwordHash = await hashPassword(data.password)
    try {
      await sql`
        INSERT INTO admins (email, password_hash, full_name, is_super_admin)
        VALUES (${data.email.toLowerCase()}, ${passwordHash}, ${data.fullName}, true)
      `
    } catch (err) {
      // Unique violation on admins_singleton_idx (23505) means another
      // request created the first admin between our pre-check and this
      // insert -- report it the same way as the pre-check above, not as
      // a raw Postgres error.
      const code = 'code' in (err as object) ? (err as { code: string }).code : undefined
      if (code === '23505') {
        throw new Error("Un compte administrateur existe déjà -- une seule création est autorisée.")
      }
      throw err
    }

    return { ok: true }
  })

// ---------- Forgot / reset password ----------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

const requestResetSchema = z.object({ email: z.string().email().max(255) })

export const requestAdminPasswordReset = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, authRateLimit])
  .validator(requestResetSchema)
  .handler(async ({ data }) => {
    const rows = await sql<{ id: string; fullName: string }[]>`
      SELECT id, full_name FROM admins WHERE email = ${data.email.toLowerCase()}
    `
    const admin = rows[0]

    // Always return the same success response whether or not the email
    // matches an admin -- otherwise this endpoint would let anyone probe
    // for the (single) admin's email address by trying candidates.
    if (admin) {
      const rawToken = generateSessionToken() // 32 random bytes, hex-encoded -- reused as a generic opaque-token generator
      const tokenHash = await sha256Hex(rawToken)
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

      await sql`
        INSERT INTO admin_password_resets (admin_id, token_hash, expires_at)
        VALUES (${admin.id}, ${tokenHash}, ${expiresAt})
      `

      const appOrigin = process.env.APP_ORIGIN ?? ''
      const resetUrl = `${appOrigin.replace(/\/$/, '')}/admin/reset-password?token=${rawToken}`

      await sendEmail({
        to: data.email.toLowerCase(),
        subject: 'Réinitialisation du mot de passe administrateur — AlgerBot',
        text:
          `Bonjour ${admin.fullName},\n\n` +
          `Une demande de réinitialisation de mot de passe a été effectuée pour votre compte administrateur AlgerBot.\n\n` +
          `Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 1 heure) :\n${resetUrl}\n\n` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
        html:
          `<p>Bonjour ${admin.fullName},</p>` +
          `<p>Une demande de réinitialisation de mot de passe a été effectuée pour votre compte administrateur AlgerBot.</p>` +
          `<p><a href="${resetUrl}">Cliquez ici pour choisir un nouveau mot de passe</a> (valable 1 heure).</p>` +
          `<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
      })
    }

    return { ok: true }
  })

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
})

export const resetAdminPassword = createServerFn({ method: 'POST' })
  .middleware([csrfMiddleware, authRateLimit])
  .validator(resetPasswordSchema)
  .handler(async ({ data }) => {
    const tokenHash = await sha256Hex(data.token)
    const rows = await sql<{ id: string; adminId: string; expiresAt: Date; usedAt: Date | null }[]>`
      SELECT id, admin_id, expires_at, used_at FROM admin_password_resets WHERE token_hash = ${tokenHash}
    `
    const reset = rows[0]

    if (!reset || reset.usedAt !== null || reset.expiresAt.getTime() < Date.now()) {
      throw new Error('Ce lien de réinitialisation est invalide ou a expiré.')
    }

    const passwordHash = await hashPassword(data.newPassword)

    await sql`UPDATE admins SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${reset.adminId}`
    await sql`UPDATE admin_password_resets SET used_at = now() WHERE id = ${reset.id}`
    // Log out everywhere -- a password reset should invalidate any
    // session an attacker (or the admin's own old device) might still hold.
    await sql`DELETE FROM sessions WHERE admin_id = ${reset.adminId}`

    return { ok: true }
  })


