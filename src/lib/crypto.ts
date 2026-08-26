// Password hashing (admins only — merchants never have passwords) and
// generic HMAC signing used for the session cookie. Web Crypto only, per
// spec. process.env read lazily inside functions, never at module scope.

const encoder = new TextEncoder()

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return out
}

const PBKDF2_ITERATIONS = 210_000 // OWASP-recommended floor as of 2024/2025

/**
 * Hashes a password with PBKDF2-SHA256. Output format:
 * "pbkdf2$<iterations>$<salt-hex>$<hash-hex>"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derivedBits)}`
}

/**
 * Verifies a password against a stored hash in constant time.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = hexToBytes(parts[2])
  const expectedHex = parts[3]

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const actualHex = bytesToHex(derivedBits)

  return timingSafeEqualHex(actualHex, expectedHex)
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Signs an opaque session token with HMAC-SHA256 using SESSION_SECRET, for
 * use as an HttpOnly cookie value: "<token>.<signature-hex>". The token
 * itself (not the signature) is what gets hashed and looked up in the
 * sessions table — see auth.server.ts.
 */
export async function signToken(token: string): Promise<string> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(token))
  return `${token}.${bytesToHex(sig)}`
}

/**
 * Verifies a signed cookie value and returns the raw token if valid, or null
 * if the signature doesn't match (tampered or wrong secret).
 */
export async function verifySignedToken(signedValue: string): Promise<string | null> {
  const dotIndex = signedValue.lastIndexOf('.')
  if (dotIndex === -1) return null
  const token = signedValue.slice(0, dotIndex)
  const providedSig = signedValue.slice(dotIndex + 1)

  const expected = await signToken(token)
  const expectedSig = expected.slice(expected.lastIndexOf('.') + 1)

  return timingSafeEqualHex(providedSig, expectedSig) ? token : null
}

export function generateSessionToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return bytesToHex(digest)
}
