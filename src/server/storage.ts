import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  presignPublicImageUpload,
  presignPrivateProofUpload,
  StorageValidationError,
} from '~/lib/storage'
import { merchantAuthMiddleware } from '~/lib/auth'
import { uploadRateLimit } from '~/lib/rate-limit'
import { sql } from '~/lib/db'

// These server functions are the only way client code obtains a presigned
// upload URL. Each one re-derives ownerId from the authenticated session
// rather than trusting a client-supplied id, so a merchant can never request
// an upload key namespaced under another merchant's/store's prefix.
//
// Both merchantAuthMiddleware (auth) and uploadRateLimit (each call is an
// Adex round trip, so uncapped calls could be used to hammer Adex or
// exhaust a merchant's storage quota) are applied via .middleware(),
// consistent with the pattern used across every other server function —
// previously these three relied on an in-handler requireMerchantSession()
// call instead, which worked but was an inconsistent, easy-to-miss
// pattern compared to every other authenticated endpoint in this codebase.

const requestProductImageUploadSchema = z.object({
  productId: z.string().uuid(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive(),
})

export const requestProductImageUpload = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, uploadRateLimit])
  .validator(requestProductImageUploadSchema)
  .handler(async ({ context, data }) => {
    // H1 fix: this used to defer ownership checking entirely to the later
    // confirm step, but that meant any authenticated merchant could request
    // (and receive) a valid presigned PUT URL namespaced under an arbitrary
    // productId they don't own — confirmProductImageUpload's ownership
    // check protects the DB row, but the presign step should never hand out
    // a writable URL into another merchant's key namespace in the first
    // place. Verify ownership here too.
    const owned = await sql<{ id: string }[]>`
      SELECT p.id FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = ${data.productId} AND s.merchant_id = ${context.merchantId}
    `
    if (owned.length === 0) {
      return { ok: false as const, error: 'Produit introuvable' }
    }
    try {
      const result = await presignPublicImageUpload({
        prefix: 'products',
        ownerId: data.productId,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      })
      return { ok: true as const, ...result }
    } catch (err) {
      if (err instanceof StorageValidationError) {
        return { ok: false as const, error: err.message }
      }
      throw err
    }
  })

const requestStoreImageUploadSchema = z.object({
  kind: z.enum(['logo', 'banner']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive(),
})

export const requestStoreImageUpload = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, uploadRateLimit])
  .validator(requestStoreImageUploadSchema)
  .handler(async ({ context, data }) => {
    try {
      const result = await presignPublicImageUpload({
        prefix: 'stores',
        ownerId: `${context.merchantId}-${data.kind}`,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      })
      return { ok: true as const, ...result }
    } catch (err) {
      if (err instanceof StorageValidationError) {
        return { ok: false as const, error: err.message }
      }
      throw err
    }
  })

const requestBillingProofUploadSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  sizeBytes: z.number().int().positive(),
})

export const requestBillingProofUpload = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, uploadRateLimit])
  .validator(requestBillingProofUploadSchema)
  .handler(async ({ context, data }) => {
    try {
      const result = await presignPrivateProofUpload({
        merchantId: context.merchantId,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      })
      return { ok: true as const, ...result }
    } catch (err) {
      if (err instanceof StorageValidationError) {
        return { ok: false as const, error: err.message }
      }
      throw err
    }
  })


