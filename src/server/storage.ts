import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  presignPublicImageUpload,
  presignPrivateProofUpload,
  StorageValidationError,
} from '~/lib/storage'
import { merchantAuthMiddleware } from '~/lib/auth'
import { uploadRateLimit } from '~/lib/rate-limit'

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
  .handler(async ({ data }) => {
    // Ownership of productId is checked where the product row is fetched
    // (confirmProductImageUpload in product-images.ts) — here we only
    // namespace the storage key. That later step re-verifies the product
    // belongs to this merchant's store before persisting the key.
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


