import { createServerFn, createMiddleware } from '@tanstack/react-start'
import { z } from 'zod'
import { getRequest, getRequestHeader } from '@tanstack/react-start/server'
import { sql } from '~/lib/db'
import { hashPassword, verifyPassword } from '~/lib/crypto'
import { issueSession, revokeCurrentSession, adminAuthMiddleware, getOptionalAdminSession } from '~/lib/auth'
import { authRateLimit, readRateLimit } from '~/lib/rate-limit'

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



export const getOptionalAdminSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  return getOptionalAdminSession()
})


