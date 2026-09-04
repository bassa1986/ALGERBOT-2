// Implements Meta's WhatsApp Flows Data Endpoint encryption spec exactly
// as documented at developers.facebook.com/docs/whatsapp/flows/guides/
// implementingyourflowendpoint — built on Node's built-in `node:crypto`
// only, no third-party crypto package.
//
// Request from WhatsApp: { encrypted_flow_data, encrypted_aes_key,
// initial_vector } (all base64).
//   1. RSA-OAEP-SHA256 decrypt encrypted_aes_key with our private key ->
//      128-bit AES payload key.
//   2. AES-128-GCM decrypt encrypted_flow_data with that key + the given
//      IV. The last 16 bytes of the decoded blob are the GCM auth tag.
//
// Response back to WhatsApp: AES-128-GCM encrypt with the SAME payload
// key, but the IV must be flipped bit-for-bit (every byte XORed with
// 0xFF) before use — a specific, easy-to-miss requirement in Meta's spec.
// Response body is base64(ciphertext + 16-byte auth tag), sent as plain
// text (not JSON).

import { privateDecrypt, createDecipheriv, createCipheriv, constants as cryptoConstants } from 'node:crypto'

export interface EncryptedFlowRequest {
  encrypted_flow_data: string
  encrypted_aes_key: string
  initial_vector: string
}

export interface DecryptedFlowRequest {
  /** The cleartext JSON payload WhatsApp sent (version, action, screen, data, flow_token, ...). */
  body: unknown
  /** The 128-bit AES key, needed again to encrypt the response — keep in memory only, never persisted. */
  aesKey: Buffer
  /** The original (un-flipped) IV from the request — flip it before using it to encrypt the response. */
  iv: Buffer
}

/**
 * Decrypts an incoming WhatsApp Flow Data Endpoint request. Throws if the
 * private key doesn't match what's registered with Meta, or the payload
 * is malformed — callers should respond with HTTP 421 in that case (per
 * Meta's spec) so the client re-fetches a fresh public key.
 */
export function decryptFlowRequest(request: EncryptedFlowRequest, privateKeyPem: string): DecryptedFlowRequest {
  const encryptedAesKey = Buffer.from(request.encrypted_aes_key, 'base64')
  const aesKey = privateDecrypt(
    {
      key: privateKeyPem,
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedAesKey,
  )

  const iv = Buffer.from(request.initial_vector, 'base64')
  const encryptedFlowData = Buffer.from(request.encrypted_flow_data, 'base64')

  // The last 16 bytes of the encrypted blob are the GCM authentication tag.
  const authTagLength = 16
  const ciphertext = encryptedFlowData.subarray(0, encryptedFlowData.length - authTagLength)
  const authTag = encryptedFlowData.subarray(encryptedFlowData.length - authTagLength)

  const decipher = createDecipheriv('aes-128-gcm', aesKey, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

  return { body: JSON.parse(decrypted.toString('utf8')), aesKey, iv }
}

/**
 * Encrypts a response payload for a WhatsApp Flow Data Endpoint, using the
 * AES key from the matching decryptFlowRequest() call and its (un-flipped)
 * IV — this function does the required bit-flip internally. Returns the
 * base64 string to send back as the raw response body (Content-Type:
 * text/plain, NOT application/json).
 */
export function encryptFlowResponse(responseBody: unknown, aesKey: Buffer, requestIv: Buffer): string {
  const flippedIv = Buffer.from(requestIv.map((byte) => byte ^ 0xff))

  const cipher = createCipheriv('aes-128-gcm', aesKey, flippedIv)
  const plaintext = Buffer.from(JSON.stringify(responseBody), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([ciphertext, authTag]).toString('base64')
}
