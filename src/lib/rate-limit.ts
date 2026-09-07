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
  // x-forwarded-for can contain a comma-separated chain when the request
  // passed through multiple proxies; the first entry is the original
  // client. Falls back to a constant bucket key if the header is entirely
  // absent (e.g. local dev without a reverse proxy) — better to rate-limit
  // all such requests together than to silently skip limiting them.
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

/**
 * Strict: genuinely sensitive public actions -- placing an order
 * (submitCheckout) and looking an order up by phone + tracking code
 * (lookupOrder, which is guessable/enumerable and worth guarding tightly).
 * Deliberately NOT used for plain storefront browsing -- see
 * publicReadRateLimit below for why that needs a much higher ceiling.
 */
export const publicRateLimit = createRateLimitMiddleware('public', 15, 60_000)

/**
 * Generous: plain, unauthenticated storefront reads (store info, product
 * list/detail, category list). A single product-page view can cost 2-3 of
 * these calls, so a shared low budget with actual checkout/lookup actions
 * (see publicRateLimit above) meant a buyer browsing a handful of products
 * could exhaust the limit from normal use alone -- and could then get
 * blocked right as they tried to submit their actual order. 120/min still
 * comfortably stops an automated scraper/bot hammering the DB, while no
 * real human clicking through products could ever come close to it.
 */
export const publicReadRateLimit = createRateLimitMiddleware('public-read', 120, 60_000)

/** Strict: file upload presign requests, since each one is an Adex round trip. */
export const uploadRateLimit = createRateLimitMiddleware('upload', 20, 60_000)
