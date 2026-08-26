import { createMiddleware } from '@tanstack/react-start'
import { sql } from '~/lib/db'
import { generateSessionToken, sha256Hex, signToken, verifySignedToken } from '~/lib/crypto'
import { setSessionCookie, clearSessionCookie, readSessionCookieValue } from '~/lib/session-cookie'

// process.env, cookies, and request headers are all read lazily inside these
// functions, never at module scope, per the framework's execution model.

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

interface RawSessionRow {
  id: string
  merchantId: string | null
  adminId: string | null
  expiresAt: Date
}

async function lookupSessionByToken(token: string): Promise<RawSessionRow | null> {
  const tokenHash = await sha256Hex(token)
  const rows = await sql<RawSessionRow[]>`
    SELECT id, merchant_id, admin_id, expires_at
    FROM sessions
    WHERE token_hash = ${tokenHash} AND expires_at > now()
  `
  return rows[0] ?? null
}

/**
 * Reads and verifies the session cookie for the current request. Returns
 * null if there's no cookie, the signature doesn't verify, or the session
 * has expired/been revoked. This is the single source of truth for "who is
 * making this request" — everything else builds on it.
 */
async function readCurrentSession(): Promise<RawSessionRow | null> {
  const signedValue = readSessionCookieValue()
  if (!signedValue) return null

  const token = await verifySignedToken(signedValue)
  if (!token) return null

  return lookupSessionByToken(token)
}

export async function issueSession(opts: {
  merchantId?: string
  adminId?: string
  userAgent?: string | null
  ipAddress?: string | null
}): Promise<void> {
  const token = generateSessionToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

  await sql`
    INSERT INTO sessions (token_hash, merchant_id, admin_id, user_agent, ip_address, expires_at)
    VALUES (
      ${tokenHash},
      ${opts.merchantId ?? null},
      ${opts.adminId ?? null},
      ${opts.userAgent ?? null},
      ${opts.ipAddress ?? null},
      ${expiresAt}
    )
  `

  const signedToken = await signToken(token)
  setSessionCookie(signedToken)
}

export async function revokeCurrentSession(): Promise<void> {
  const signedValue = readSessionCookieValue()
  if (signedValue) {
    const token = await verifySignedToken(signedValue)
    if (token) {
      const tokenHash = await sha256Hex(token)
      await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`
    }
  }
  clearSessionCookie()
}

// ---------- Middleware ----------

export interface MerchantSessionContext {
  merchantId: string
}

/**
 * Attach to any server function that requires a logged-in merchant. Throws
 * if there's no valid session, or if the session belongs to an admin instead.
 */
export const merchantAuthMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await readCurrentSession()
    if (!session || !session.merchantId) {
      throw new Error('Unauthorized: merchant session required')
    }
    return next({ context: { merchantId: session.merchantId } satisfies MerchantSessionContext })
  },
)

export interface AdminSessionContext {
  adminId: string
}

/**
 * Attach to any server function that requires a logged-in admin.
 */
export const adminAuthMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await readCurrentSession()
    if (!session || !session.adminId) {
      throw new Error('Unauthorized: admin session required')
    }
    return next({ context: { adminId: session.adminId } satisfies AdminSessionContext })
  },
)

// ---------- Convenience helpers used outside middleware chains ----------
// (e.g. from a route's `beforeLoad`/`loader`, or from server functions that
// need session info but aren't purely gated by it.)

export interface MerchantSession {
  merchantId: string
}

export async function requireMerchantSession(): Promise<MerchantSession> {
  const session = await readCurrentSession()
  if (!session || !session.merchantId) {
    throw new Error('Unauthorized: merchant session required')
  }
  return { merchantId: session.merchantId }
}

export interface AdminSession {
  adminId: string
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await readCurrentSession()
  if (!session || !session.adminId) {
    throw new Error('Unauthorized: admin session required')
  }
  return { adminId: session.adminId }
}

/**
 * Non-throwing variant for route `beforeLoad`/loader use, where the caller
 * wants to branch on auth state rather than reject the request outright.
 */
export async function getOptionalMerchantSession(): Promise<MerchantSession | null> {
  const session = await readCurrentSession()
  if (!session || !session.merchantId) return null
  return { merchantId: session.merchantId }
}

export async function getOptionalAdminSession(): Promise<AdminSession | null> {
  const session = await readCurrentSession()
  if (!session || !session.adminId) return null
  return { adminId: session.adminId }
}
