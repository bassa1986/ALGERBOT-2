import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'

// AlgerBot uses ONE cookie for both principal types (merchant, admin); which
// one a session belongs to is looked up from the sessions table (see
// db schema: session_owner_exclusive check constraint — exactly one of
// merchant_id/admin_id is set per row).
const SESSION_COOKIE = '__Host-algerbot-session'
const THIRTY_DAYS = 60 * 60 * 24 * 30

export function setSessionCookie(signedToken: string): void {
  setResponseHeader(
    'Set-Cookie',
    [
      `${SESSION_COOKIE}=${signedToken}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${THIRTY_DAYS}`,
    ].join('; '),
  )
}

export function clearSessionCookie(): void {
  setResponseHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  )
}

export function readSessionCookieValue(): string | null {
  const header = getRequestHeader('cookie')
  if (!header) return null
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq) === SESSION_COOKIE) return part.slice(eq + 1)
  }
  return null
}
