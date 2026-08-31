import sharp from 'sharp'
import { IMAGE_MAX_UPLOAD_BYTES, IMAGE_MAX_DIMENSION, IMAGE_WEBP_QUALITY } from '~/lib/plans'

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Image trop volumineuse (maximum 5 Mo).')
    this.name = 'PayloadTooLargeError'
  }
}

/**
 * Downscales to a max 1200px side (never upscales), converts to WebP, and
 * compresses at ~78% quality (targets ~150-250KB per photo while keeping
 * alpha transparency if present). Runs entirely in memory on the buffer —
 * sharp writes no temp files to disk, so there is nothing to clean up
 * afterward regardless of success or failure.
 */
export async function optimizeProductImage(
  rawBytes: Buffer,
): Promise<{ bytes: Buffer; byteSize: number }> {
  if (rawBytes.byteLength > IMAGE_MAX_UPLOAD_BYTES) {
    throw new PayloadTooLargeError()
  }

  const optimized = await sharp(rawBytes)
    .resize({
      width: IMAGE_MAX_DIMENSION,
      height: IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: IMAGE_WEBP_QUALITY,
      alphaQuality: 90,
    })
    .toBuffer()

  return { bytes: optimized, byteSize: optimized.byteLength }
}
