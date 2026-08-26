import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { merchantAuthMiddleware } from '~/lib/auth'
import { fetchObjectBytes, putObjectBytes, deleteObject } from '~/lib/storage'
import { removeBackgroundToWhite, BackgroundRemovalUnavailableError } from '~/lib/rembg'
import { mutationRateLimit } from '~/lib/rate-limit'

const MAX_IMAGES_PER_PRODUCT = 6

async function assertProductOwnership(productId: string, merchantId: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    SELECT p.id FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE p.id = ${productId} AND s.merchant_id = ${merchantId}
  `
  if (rows.length === 0) throw new Error('Produit introuvable')
}

/**
 * Best-effort background removal on a just-uploaded product photo: fetches
 * the bytes back from Adex, runs them through the self-hosted rembg
 * service, and overwrites the same storage key with the white-background
 * result. Whether REMBG_SERVICE_URL is unset, the service is unreachable,
 * or processing fails for any other reason, this silently leaves the
 * original photo in place — background removal is a nice-to-have polish
 * step, never a blocker for the merchant adding a product photo.
 */
async function tryRemoveBackground(storageKey: string): Promise<void> {
  try {
    const original = await fetchObjectBytes(storageKey)
    const processed = await removeBackgroundToWhite(original)
    await putObjectBytes(storageKey, processed, 'image/jpeg')
  } catch (err) {
    if (err instanceof BackgroundRemovalUnavailableError) {
      // Expected in normal operation (service not configured / temporarily
      // down) — not worth surfacing as an error, just keep the original.
      return
    }
    // Unexpected failure in the fetch/put round-trip itself (e.g. Adex
    // hiccup) — log for visibility but still never fail the upload over
    // this cosmetic step.
    console.error('tryRemoveBackground failed unexpectedly', err)
  }
}

/**
 * Called after the client has successfully PUT the file to the presigned
 * URL from requestProductImageUpload. This is the point where the image
 * actually becomes part of the product — the presigned URL alone doesn't
 * touch the database, so an abandoned upload never creates orphan rows.
 * Server-side enforcement of the 6-image cap happens here, mirroring the
 * client-side counter.
 */
const confirmImageSchema = z.object({
  productId: z.string().uuid(),
  storageKey: z.string().min(1),
  url: z.string().url(),
})

export const confirmProductImageUpload = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(confirmImageSchema)
  .handler(async ({ context, data }) => {
    await assertProductOwnership(data.productId, context.merchantId)

    // Runs before the DB insert, at the SAME storage key/URL — so whether
    // or not background removal actually happens, the row we're about to
    // write is already correct either way.
    await tryRemoveBackground(data.storageKey)

    return sql.begin(async (tx) => {
      const countRows = await tx<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM product_images WHERE product_id = ${data.productId}
      `
      const currentCount = parseInt(countRows[0].count, 10)
      if (currentCount >= MAX_IMAGES_PER_PRODUCT) {
        throw new Error(`Maximum ${MAX_IMAGES_PER_PRODUCT} photos par produit`)
      }

      const isFirstImage = currentCount === 0
      const rows = await tx<{ id: string }[]>`
        INSERT INTO product_images (product_id, storage_key, url, sort_order, is_cover)
        VALUES (${data.productId}, ${data.storageKey}, ${data.url}, ${currentCount}, ${isFirstImage})
        RETURNING id
      `
      return { id: rows[0].id }
    })
  })

const reorderSchema = z.object({
  productId: z.string().uuid(),
  // Full ordered list of this product's image ids — replaces sort_order for
  // all of them in one call so drag-reorder is a single round trip.
  orderedImageIds: z.array(z.string().uuid()).max(MAX_IMAGES_PER_PRODUCT),
})

export const reorderProductImages = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(reorderSchema)
  .handler(async ({ context, data }) => {
    await assertProductOwnership(data.productId, context.merchantId)

    // Verify every id actually belongs to this product before writing —
    // otherwise a crafted id list could reorder another product's images
    // (or silently no-op on rows that don't match the WHERE below, but
    // being explicit here avoids relying on that as the only guard).
    const ownedRows = await sql<{ id: string }[]>`
      SELECT id FROM product_images WHERE product_id = ${data.productId}
    `
    const ownedIds = new Set(ownedRows.map((r) => r.id))
    for (const id of data.orderedImageIds) {
      if (!ownedIds.has(id)) throw new Error('Image invalide')
    }

    await sql.begin(async (tx) => {
      for (let i = 0; i < data.orderedImageIds.length; i++) {
        await tx`
          UPDATE product_images SET sort_order = ${i}
          WHERE id = ${data.orderedImageIds[i]} AND product_id = ${data.productId}
        `
      }
    })
    return { ok: true }
  })

const setCoverSchema = z.object({
  productId: z.string().uuid(),
  imageId: z.string().uuid(),
})

export const setProductCoverImage = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(setCoverSchema)
  .handler(async ({ context, data }) => {
    await assertProductOwnership(data.productId, context.merchantId)

    await sql.begin(async (tx) => {
      await tx`UPDATE product_images SET is_cover = false WHERE product_id = ${data.productId}`
      const result = await tx`
        UPDATE product_images SET is_cover = true
        WHERE id = ${data.imageId} AND product_id = ${data.productId}
      `
      if (result.count === 0) throw new Error('Image introuvable')
    })
    return { ok: true }
  })

const deleteImageSchema = z.object({
  productId: z.string().uuid(),
  imageId: z.string().uuid(),
})

export const deleteProductImage = createServerFn({ method: 'POST' })
  .middleware([merchantAuthMiddleware, mutationRateLimit])
  .validator(deleteImageSchema)
  .handler(async ({ context, data }) => {
    await assertProductOwnership(data.productId, context.merchantId)

    const deletedStorageKey = await sql.begin(async (tx) => {
      const deletedRows = await tx<{ isCover: boolean; storageKey: string }[]>`
        DELETE FROM product_images
        WHERE id = ${data.imageId} AND product_id = ${data.productId}
        RETURNING is_cover, storage_key
      `
      if (deletedRows.length === 0) throw new Error('Image introuvable')

      // If the deleted image was the cover, promote the next one (by
      // sort_order) so the product always has a cover as long as it has
      // any image left.
      if (deletedRows[0].isCover) {
        const remaining = await tx<{ id: string }[]>`
          SELECT id FROM product_images
          WHERE product_id = ${data.productId}
          ORDER BY sort_order ASC LIMIT 1
        `
        if (remaining.length > 0) {
          await tx`UPDATE product_images SET is_cover = true WHERE id = ${remaining[0].id}`
        }
      }

      return deletedRows[0].storageKey
    })

    // Deleting the Adex object happens AFTER the DB transaction commits,
    // and deliberately doesn't roll back the deletion if this fails — the
    // database row is already gone (that's the state the merchant asked
    // for and sees immediately), and a slow/failed external HTTP call must
    // never hold a DB transaction open. A leftover orphaned object in this
    // failure case is a much smaller problem than a stuck transaction or
    // a delete that silently didn't take effect from the merchant's POV.
    try {
      await deleteObject(deletedStorageKey)
    } catch (err) {
      console.error('Failed to delete Adex object after product image removal', deletedStorageKey, err)
    }
    return { ok: true }
  })
