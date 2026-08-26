import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { requestProductImageUpload } from '~/server/storage'
import { confirmProductImageUpload } from '~/server/product-images'
import { resizeImageToJpeg, uploadToPresignedUrl } from '~/lib/upload'

const MAX_IMAGES = 6

/**
 * Encapsulates the full "camera/file -> resized JPEG -> presigned PUT ->
 * confirm in DB" pipeline shared by both the Add Product camera button and
 * the inline per-row photo control, so the two entry points can't drift in
 * behavior (resize target, cap enforcement, error handling).
 */
export function useProductPhotoUpload(productId: string, currentImageCount: number) {
  const requestUpload = useServerFn(requestProductImageUpload)
  const confirmUpload = useServerFn(confirmProductImageUpload)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadFiles(files: FileList | File[]): Promise<void> {
    setError(null)
    const fileArray = Array.from(files)
    const remainingSlots = MAX_IMAGES - currentImageCount

    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} photos par produit`)
      return
    }

    const toUpload = fileArray.slice(0, remainingSlots)
    if (fileArray.length > remainingSlots) {
      setError(`Seules ${remainingSlots} photo(s) ont été ajoutées (limite de ${MAX_IMAGES})`)
    }

    setIsUploading(true)
    try {
      for (const file of toUpload) {
        const resized = await resizeImageToJpeg(file, 1600)
        const presign = await requestUpload({
          data: { productId, mimeType: 'image/jpeg', sizeBytes: resized.size },
        })
        if (!presign.ok) {
          setError(presign.error)
          continue
        }
        await uploadToPresignedUrl(presign.uploadUrl, resized)
        await confirmUpload({
          data: { productId, storageKey: presign.storageKey, url: presign.publicUrl },
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement')
    } finally {
      setIsUploading(false)
    }
  }

  return { uploadFiles, isUploading, error, setError }
}
