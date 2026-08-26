// Telegram authentication verification — two distinct schemes:
//
// 1. Login Widget (web): payload is a flat object with a `hash` field.
//    Verification: HMAC-SHA256(data_check_string, SHA256(bot_token)) === hash
//    https://core.telegram.org/widgets/login#checking-authorization
//
// 2. WebApp initData (Telegram Mini App): payload is a URL-encoded query
//    string with a `hash` field.
//    Verification: HMAC-SHA256(data_check_string, HMAC-SHA256(bot_token, "WebAppData")) === hash
//    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Both reject stale payloads via auth_date. process.env read lazily inside
// functions only.

const encoder = new TextEncoder()

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256Raw(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

async function sha256Raw(message: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(message))
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')
  return token
}

// Reject auth payloads older than this, to prevent replay of a captured link.
const MAX_AUTH_AGE_SECONDS = 300 // 5 minutes

export interface TelegramLoginWidgetPayload {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

/**
 * Verifies a Telegram Login Widget payload (used on the merchant web login
 * page, not inside the Telegram app itself). Returns true only if the hash
 * matches AND auth_date is recent.
 */
export async function verifyLoginWidgetPayload(payload: TelegramLoginWidgetPayload): Promise<boolean> {
  const { hash, ...rest } = payload

  const now = Math.floor(Date.now() / 1000)
  if (now - rest.auth_date > MAX_AUTH_AGE_SECONDS) return false
  if (rest.auth_date > now + 60) return false // reject payloads claiming to be from the future

  const dataCheckString = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = await sha256Raw(getBotToken())
  const computedHmac = await hmacSha256Raw(secretKey, dataCheckString)
  const computedHex = bytesToHex(computedHmac)

  return timingSafeEqualHex(computedHex, hash)
}

export interface TelegramWebAppUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
}

export interface VerifiedInitData {
  user: TelegramWebAppUser
  authDate: number
}

/**
 * Verifies a Telegram WebApp `initData` raw query string (as provided by
 * `Telegram.WebApp.initData` inside the Telegram Mini App WebView).
 * Returns the parsed user on success, or null if verification fails or the
 * payload is stale.
 */
export async function verifyWebAppInitData(initData: string): Promise<VerifiedInitData | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const authDateStr = params.get('auth_date')
  if (!authDateStr) return null
  const authDate = parseInt(authDateStr, 10)

  const now = Math.floor(Date.now() / 1000)
  if (now - authDate > MAX_AUTH_AGE_SECONDS) return null
  if (authDate > now + 60) return null

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  // For WebApp initData, the secret key is HMAC-SHA256(bot_token, "WebAppData")
  // (note: key/message order is reversed vs. the login widget scheme).
  const webAppDataKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const secretKey = await crypto.subtle.sign('HMAC', webAppDataKey, encoder.encode(getBotToken()))

  const computedHmac = await hmacSha256Raw(secretKey, dataCheckString)
  const computedHex = bytesToHex(computedHmac)

  if (!timingSafeEqualHex(computedHex, hash)) return null

  const userJson = params.get('user')
  if (!userJson) return null

  let user: TelegramWebAppUser
  try {
    user = JSON.parse(userJson)
  } catch {
    return null
  }
  if (typeof user.id !== 'number') return null

  return { user, authDate }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
