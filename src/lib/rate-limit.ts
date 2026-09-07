import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'

// Single shared in-memory sliding-window rate limiter. Acceptable for a
// single-instance deployment (the state lives in this process's memory);
// swap for a shared store (Redis, etc.) if the app is ever run with
// multiple server instances, since each instance would otherwise track
// its own independent counters.
//
// This replaces three previously-duplicated, copy-pasted rate-limit
// implementations (admin-auth.ts, checkout.ts x2) with one factory that
// every server function needing rate limiting imports and configures,
// rather than reimplementing the sliding-window logic each time.

const buckets = new Map<string, number[]>()

function isAllowed(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const attempts = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  attempts.push(now)
  buckets.set(key, attempts)
  return attempts.length <= max
}

// M4 fix: isAllowed() above filters each key's own array down to recent
// attempts, but a key that reaches zero recent attempts is never removed
// from the map itself -- on a public, internet-facing app this grows
// unbounded with every distinct IP that ever hits a rate-limited endpoint,
// a slow memory leak that only shows up after days/weeks of uptime. Sweep
// the whole map periodically and drop any key with nothing left in its
// window.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_BUCKET_AGE_MS = 60 * 60 * 1000 // an hour is well beyond any window used below

function sweepBuckets(): void {
  const now = Date.now()
  for (const [key, attempts] of buckets) {
    const fresh = attempts.filter((t) => now - t < MAX_BUCKET_AGE_MS)
    if (fresh.length === 0) {
      buckets.delete(key)
    } else if (fresh.length !== attempts.length) {
      buckets.set(key, fresh)
    }
  }
}

// Only runs in a long-lived server process (not during build/SSG), and
// unref'd so it never keeps the process alive on its own -- consistent
// with this being a best-effort cleanup, not something correctness
// depends on.
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  const timer = setInterval(sweepBuckets, SWEEP_INTERVAL_MS)
  timer.unref?.()
}

/**
 * Plain-function rate-limit check, for callers that aren't a
 * createServerFn (which the middleware factory below is built for) — the
 * WhatsApp Cloud API routes (src/routes/api/whatsapp/*.ts) are raw HTTP
 * route handlers (`server.handlers.GET/POST`), a different TanStack Start
 * mechanism with no middleware pipeline of its own, so they call this
 * directly rather than going through createRateLimitMiddleware.
 * `clientIp` must be extracted by the caller from its own Request object,
 * since getClientIp() below relies on TanStack Start's function-context
 * header helpers, which aren't available in a raw route handler.
 */
export function checkRateLimit(bucketName: string, clientIp: string, max: number, windowMs: number): boolean {
  return isAllowed(`${bucketName}:${clientIp}`, max, windowMs)
}

const getClientIp = createServerOnlyFn((): string => {
  // M1 fix: x-forwarded-for was previously trusted with no verification
  // that a trusted reverse proxy actually set it -- on a deployment
  // reachable directly (no proxy in front, or one that appends rather
  // than overwrites), any client could set an arbitrary X-Forwarded-For
  // and get a fresh rate-limit bucket on every request, fully defeating
  // authRateLimit/publicRateLimit/etc.
  //
  // This project deploys to Vercel: Vercel's edge network sets (and
  // documents as non-spoofable, since it overwrites rather than appends)
  // `x-vercel-forwarded-for` specifically for this reason -- prefer that
  // header when present. Plain `x-forwarded-for` is kept only as a
  // fallback for local dev / non-Vercel deployments, where it is NOT a
  // safe trust boundary on its own; if this is ever deployed behind a
  // different proxy, replace this fallback with that proxy's own
  // documented client-IP header (or a shared-secret check) rather than
  // trusting x-forwarded-for blindly.
  const vercelIp = getRequestHeader('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (vercelIp) return vercelIp
  return getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
})

/**
 * Creates a server-function middleware that rate-limits by client IP
 * under the given bucket name. Each distinct `bucketName` gets its own
 * independent counters — use a different name per endpoint (or per
 * logical group of endpoints that should share a budget).
 */
export function createRateLimitMiddleware(
  bucketName: string,
  max: number,
  windowMs: number,
  message = 'Too many requests. Please try again shortly.',
) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const ip = getClientIp()
    if (!isAllowed(`${bucketName}:${ip}`, max, windowMs)) {
      throw new Error(message)
    }
    return next()
  })
}

// ---------- Shared, pre-configured limiters for common endpoint shapes ----------
// Reuse these directly rather than calling createRateLimitMiddleware with
// ad-hoc numbers at every call site, so the actual limits stay consistent
// and easy to audit/tune in one place.

/** Strict: auth attempts (login, admin login). Guards against credential brute-forcing. */
export const authRateLimit = createRateLimitMiddleware('auth', 5, 60_000)

/** Moderate: state-changing writes (create/update/delete a row the user owns). */
export const mutationRateLimit = createRateLimitMiddleware('mutation', 30, 60_000)

/** Generous: plain reads (list/get). Still capped, since even reads cost DB round trips. */
export const readRateLimit = createRateLimitMiddleware('read', 1000, 60_000)

/** Strict: public, unauthenticated, potentially-abusable endpoints (checkout, order lookup, storefront search). */
export const publicRateLimit = createRateLimitMiddleware('public', 15, 60_000)

/** Strict: file upload presign requests, since each one is an Adex round trip. */
export const uploadRateLimit = createRateLimitMiddleware('upload', 20, 60_000)
