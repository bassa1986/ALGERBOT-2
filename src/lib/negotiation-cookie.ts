import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { randomUUID } from 'node:crypto'

// Identifies a buyer's BROWSER (not an account — buyers on the storefront
// are always anonymous) across their negotiation threads. Deliberately NOT
// signed/HMAC'd like the merchant/admin session cookie in
// session-cookie.ts: nothing sensitive is gated behind this beyond "read
// the messages in threads this same browser started", and a random UUID
// is already unguessable enough for that bar. HttpOnly since nothing
// client-side needs to read the raw value — it's only ever sent back to
// our own server functions automatically by the browser.
const NEGOTIATION_BUYER_COOKIE = '__Host-algerbot-negotiation-buyer'
const ONE_YEAR = 60 * 60 * 24 * 365

function readCookie(name: string): string | null {
  const header = getRequestHeader('cookie')
  if (!header) return null
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq) === name) return part.slice(eq + 1)
  }
  return null
}

/**
 * Returns this browser's negotiation buyer token, creating and setting a
 * new one via Set-Cookie if none exists yet. Safe to call from any public
 * server function — always returns a usable token.
 */
export function getOrCreateNegotiationBuyerToken(): string {
  const existing = readCookie(NEGOTIATION_BUYER_COOKIE)
  if (existing) return existing

  const token = randomUUID()
  setResponseHeader(
    'Set-Cookie',
    [`${NEGOTIATION_BUYER_COOKIE}=${token}`, 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${ONE_YEAR}`].join(
      '; ',
    ),
  )
  return token
}

/** Read-only variant for endpoints that must reject an unknown buyer (e.g. polling a thread) rather than mint a new one. */
export function readNegotiationBuyerToken(): string | null {
  return readCookie(NEGOTIATION_BUYER_COOKIE)
}
