/**
 * Triggers a browser download of a base64-encoded file (used for xlsx
 * exports/templates returned from server functions, which can't stream a
 * Blob directly across the RPC boundary).
 */
export function downloadBase64File(base64: string, filename: string, mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const byteChars = atob(base64)
  const byteNumbers = new Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Uploads a File/Blob directly to Adex using a presigned PUT URL obtained
 * from one of the request*Upload server functions. This runs in the
 * browser — the file bytes never pass through our own server, only the
 * short-lived signed URL does.
 */
export async function uploadToPresignedUrl(uploadUrl: string, file: File | Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) {
    throw new Error(`Échec du téléversement (${res.status})`)
  }
}

/**
 * Resizes an image client-side to a max dimension (preserving aspect ratio)
 * and re-encodes as JPEG at the given quality. Used so camera captures
 * (which can be several MB at full sensor resolution) are shrunk before
 * upload — per spec, product photos are resized to ~1600px JPEG client-side.
 */
export async function resizeImageToJpeg(
  file: File,
  maxDimension = 1600,
  quality = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas non supporté')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Échec de la conversion JPEG'))),
      'image/jpeg',
      quality,
    )
  })
}
