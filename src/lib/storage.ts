// Adex storage helper — S3-compatible object store, presigned URLs signed
// with AWS SigV4 using only Web Crypto (no aws-sdk dependency, per spec).
//
// process.env is read lazily inside functions, never at module scope, so this
// file is safe to import from anywhere without requiring env vars to already
// be injected.

interface AdexConfig {
  endpoint: string // e.g. "https://adex.example.com"
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
}

function getConfig(): AdexConfig {
  const endpoint = process.env.ADEX_ENDPOINT
  const region = process.env.ADEX_REGION
  const bucket = process.env.ADEX_BUCKET
  const accessKeyId = process.env.ADEX_ACCESS_KEY_ID
  const secretAccessKey = process.env.ADEX_SECRET_ACCESS_KEY
  const publicBaseUrl = process.env.ADEX_PUBLIC_BASE_URL

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new Error(
      'Adex storage is not configured. Required env vars: ADEX_ENDPOINT, ADEX_REGION, ' +
        'ADEX_BUCKET, ADEX_ACCESS_KEY_ID, ADEX_SECRET_ACCESS_KEY, ADEX_PUBLIC_BASE_URL',
    )
  }

  return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl }
}

// ---------- SigV4 primitives (Web Crypto only) ----------

const encoder = new TextEncoder()

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return bufferToHex(digest)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Normalizes any Uint8Array (including ones backed by a SharedArrayBuffer,
  // which crypto.subtle rejects under stricter modern TS DOM typings) into a
  // plain ArrayBuffer-backed copy.
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return buf
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, toArrayBuffer(encoder.encode(msg)))
  return new Uint8Array(sig)
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmac(encoder.encode('AWS4' + secretKey), dateStamp)
  const kRegion = await hmac(kDate, region)
  const kService = await hmac(kRegion, service)
  const kSigning = await hmac(kService, 'aws4_request')
  return kSigning
}

function toAmzDate(d: Date): { amzDate: string; dateStamp: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const amzDate = iso // e.g. 20260818T154500Z
  const dateStamp = amzDate.slice(0, 8) // e.g. 20260818
  return { amzDate, dateStamp }
}

function uriEncode(str: string, encodeSlash = true): string {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%2F/g, encodeSlash ? '%2F' : '/')
}

/**
 * Builds a presigned URL for the given HTTP method and object key, using
 * SigV4 query-string signing (the standard scheme for presigned S3 URLs).
 */
async function presignUrl(opts: {
  method: 'GET' | 'PUT' | 'DELETE'
  key: string
  expiresInSeconds: number
  extraHeaders?: Record<string, string>
}): Promise<string> {
  const config = getConfig()
  const { method, key, expiresInSeconds } = opts

  const url = new URL(config.endpoint)
  const host = url.host
  const service = 's3'
  const now = new Date()
  const { amzDate, dateStamp } = toAmzDate(now)
  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`
  const credential = `${config.accessKeyId}/${credentialScope}`

  const canonicalUri = `/${config.bucket}/${uriEncode(key, false)}`

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  }

  const sortedKeys = Object.keys(queryParams).sort()
  const canonicalQueryString = sortedKeys
    .map((k) => `${uriEncode(k)}=${uriEncode(queryParams[k])}`)
    .join('&')

  const canonicalHeaders = `host:${host}\n`
  const signedHeaders = 'host'
  const payloadHash = 'UNSIGNED-PAYLOAD'

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n')

  const signingKey = await getSignatureKey(
    config.secretAccessKey,
    dateStamp,
    config.region,
    service,
  )
  const signatureBytes = await hmac(signingKey, stringToSign)
  const signature = bufferToHex(toArrayBuffer(signatureBytes))

  return `${url.protocol}//${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`
}

// ---------- Public API ----------

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_PROOF_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB
const MAX_PROOF_BYTES = 15 * 1024 * 1024 // 15MB

export class StorageValidationError extends Error {}

function assertValid(
  mimeType: string,
  sizeBytes: number,
  allowed: Set<string>,
  maxBytes: number,
): void {
  if (!allowed.has(mimeType)) {
    throw new StorageValidationError(`Type de fichier non autorisé: ${mimeType}`)
  }
  if (sizeBytes <= 0 || sizeBytes > maxBytes) {
    throw new StorageValidationError(
      `Fichier trop volumineux (max ${Math.floor(maxBytes / 1024 / 1024)}MB)`,
    )
  }
}

function randomKeySegment(): string {
  return crypto.randomUUID()
}

/**
 * Presigned PUT for a public asset (product image, store logo/banner).
 * Returns the upload URL (PUT to this URL with the file body) plus the
 * final public URL to store once the upload succeeds.
 */
export async function presignPublicImageUpload(opts: {
  prefix: 'products' | 'stores' // logical folder
  ownerId: string // storeId or productId, for key namespacing
  mimeType: string
  sizeBytes: number
}): Promise<{ uploadUrl: string; publicUrl: string; storageKey: string }> {
  assertValid(opts.mimeType, opts.sizeBytes, ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_BYTES)

  const config = getConfig()
  const ext = opts.mimeType === 'image/png' ? 'png' : opts.mimeType === 'image/webp' ? 'webp' : 'jpg'
  const storageKey = `${opts.prefix}/${opts.ownerId}/${randomKeySegment()}.${ext}`

  const uploadUrl = await presignUrl({
    method: 'PUT',
    key: storageKey,
    expiresInSeconds: 300, // 5 minutes to complete the upload
  })

  const publicUrl = `${config.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`

  return { uploadUrl, publicUrl, storageKey }
}

/**
 * Presigned PUT for a private object (BaridiMob billing proof). Never
 * generates a public URL — retrieval is always via presignPrivateGet.
 */
export async function presignPrivateProofUpload(opts: {
  merchantId: string
  mimeType: string
  sizeBytes: number
}): Promise<{ uploadUrl: string; storageKey: string }> {
  assertValid(opts.mimeType, opts.sizeBytes, ALLOWED_PROOF_MIME_TYPES, MAX_PROOF_BYTES)

  const ext = opts.mimeType === 'application/pdf' ? 'pdf' : opts.mimeType === 'image/png' ? 'png' : 'jpg'
  // "private/" prefix signals intent; actual access control is that this
  // key is never written into a public_url column and only ever read via
  // presignPrivateGet, which requires a caller-side auth check first.
  const storageKey = `private/billing-proofs/${opts.merchantId}/${randomKeySegment()}.${ext}`

  const uploadUrl = await presignUrl({
    method: 'PUT',
    key: storageKey,
    expiresInSeconds: 300,
  })

  return { uploadUrl, storageKey }
}

/**
 * Short-lived presigned GET for a private object. Caller MUST verify the
 * requester is authorized (admin, or the owning merchant) before calling
 * this — this function itself does no authorization, it only signs.
 */
export async function presignPrivateGet(
  storageKey: string,
  expiresInSeconds = 300,
): Promise<string> {
  return presignUrl({ method: 'GET', key: storageKey, expiresInSeconds })
}

/**
 * Permanently deletes an object from Adex by its storage key. Used when a
 * merchant removes a product photo (or any other owned asset) so storage
 * doesn't silently accumulate orphaned files forever. Idempotent from the
 * caller's perspective: a 404 from Adex (already gone) is treated the same
 * as success, since the end state — object absent — is what the caller
 * actually cares about.
 */
export async function deleteObject(storageKey: string): Promise<void> {
  const url = await presignUrl({ method: 'DELETE', key: storageKey, expiresInSeconds: 60 })
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete object ${storageKey}: ${res.status}`)
  }
}
/**
 * Returns the configured public base URL, so callers (e.g. store.ts, when
 * validating a client-submitted logo/banner URL) can confirm a URL actually
 * points into our own Adex bucket rather than trusting any well-formed URL.
 */
export function getPublicBaseUrl(): string {
  return getConfig().publicBaseUrl.replace(/\/$/, '')
}

// H2 fix: assertValid() above only checks the *claimed* mimeType/sizeBytes
// before minting a presigned PUT URL — the SigV4 signature only covers the
// `host` header, so nothing about the signed request actually constrains
// what bytes a client (or anyone who obtains the URL before it expires)
// puts there. The declared limits are advisory only until something reads
// the object back and checks the ACTUAL bytes. This does that: magic-byte
// sniffing for the image formats we accept, checked against the real
// Content-Length, with the oversized/wrong-type object deleted rather than
// left sitting in the bucket under a "confirmed" key.
const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,
  'image/webp': (buf) =>
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP',
  'application/pdf': (buf) => buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-',
}

export class UploadContentMismatchError extends Error {}

/**
 * Verifies an object that was just uploaded via a presigned PUT actually
 * matches one of `allowedMimeTypes` (by magic bytes, not by trusting the
 * Content-Type the client set) and is within `maxBytes`. On failure, the
 * object is deleted (best-effort) so nothing invalid is left reachable
 * under a "confirmed" storage key, then throws.
 */
export async function verifyUploadedObject(
  storageKey: string,
  allowedMimeTypes: string[],
  maxBytes: number,
): Promise<Buffer> {
  const bytes = await fetchObjectBytes(storageKey)

  if (bytes.byteLength > maxBytes) {
    await deleteObject(storageKey).catch(() => {})
    throw new UploadContentMismatchError(
      `Fichier trop volumineux (max ${Math.floor(maxBytes / 1024 / 1024)}MB)`,
    )
  }

  const matches = allowedMimeTypes.some((mime) => MAGIC_BYTES[mime]?.(bytes))
  if (!matches) {
    await deleteObject(storageKey).catch(() => {})
    throw new UploadContentMismatchError('Le contenu du fichier ne correspond pas à un type autorisé')
  }

  return bytes
}

/**
 * Fetches the raw bytes of an object already in Adex, by its storage key.
 * Used for server-side post-processing pipelines (e.g. background
 * removal) that need to read back a just-uploaded image before it's
 * referenced anywhere durable. Works for both public and private keys —
 * this signs its own short-lived GET regardless of the object's intended
 * public/private classification.
 */
export async function fetchObjectBytes(storageKey: string): Promise<Buffer> {
  const url = await presignUrl({ method: 'GET', key: storageKey, expiresInSeconds: 60 })
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch object ${storageKey}: ${res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Overwrites an existing object at the given storage key with new bytes.
 * Used to replace a just-uploaded product image with its processed
 * (background-removed) version at the SAME key, so no database row or
 * public URL ever needs to change — the confirm step just writes the
 * final bytes before recording the row.
 */
export async function putObjectBytes(
  storageKey: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const url = await presignUrl({ method: 'PUT', key: storageKey, expiresInSeconds: 60 })
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: new Uint8Array(bytes),
  })
  if (!res.ok) {
    throw new Error(`Failed to overwrite object ${storageKey}: ${res.status}`)
  }
}
