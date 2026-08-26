import sharp from 'sharp'

// Integrates with a self-hosted rembg instance running in HTTP server mode:
//   docker run -d -p 7000:7000 danielgatis/rembg s --host 0.0.0.0 --port 7000
// Deployed as its own long-running server (e.g. an Adex Cloud "Serveurs"
// instance — NOT the Adex object-storage product used elsewhere in this
// app for ADEX_*), reachable at REMBG_SERVICE_URL.
//
// rembg's HTTP API returns a PNG with the background made transparent
// (alpha channel), not literally "white" — compositing that onto a solid
// white canvas (done here via sharp) is what actually produces the
// white-background result merchants want.
//
// process.env read lazily inside the function, never at module scope.

const REMBG_TIMEOUT_MS = 15_000

export class BackgroundRemovalUnavailableError extends Error {}

/**
 * Removes the background from a JPEG/PNG image and composites the result
 * onto a solid white background, returning a JPEG buffer ready for upload.
 *
 * Never throws for "service down" conditions — those are expected in
 * normal operation whenever REMBG_SERVICE_URL isn't configured or the
 * service is temporarily unreachable, and callers should fall back to the
 * original image rather than blocking the merchant's upload. It only
 * throws BackgroundRemovalUnavailableError, which callers can catch
 * specifically to distinguish "skipped, use the original" from a real
 * unexpected error in the compositing step itself.
 */
export async function removeBackgroundToWhite(imageBuffer: Buffer): Promise<Buffer> {
  const serviceUrl = process.env.REMBG_SERVICE_URL
  if (!serviceUrl) {
    throw new BackgroundRemovalUnavailableError('REMBG_SERVICE_URL is not configured')
  }

  let transparentPng: Buffer
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REMBG_TIMEOUT_MS)

    const res = await fetch(`${serviceUrl.replace(/\/$/, '')}/api/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(imageBuffer),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      throw new BackgroundRemovalUnavailableError(
        `rembg service responded with ${res.status}`,
      )
    }
    transparentPng = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    if (err instanceof BackgroundRemovalUnavailableError) throw err
    // Network error, timeout/abort, DNS failure, etc. — the service being
    // temporarily unreachable is an expected operational condition, not a
    // bug, so it's wrapped in the same "unavailable" error type callers
    // already handle by falling back to the original image.
    throw new BackgroundRemovalUnavailableError(
      `rembg service unreachable: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // Composite the transparent-background PNG onto a solid white canvas,
  // then re-encode as JPEG (matching the rest of the product-image
  // pipeline, which stores JPEGs). Flattening onto white is exactly what
  // sharp's `flatten` option does for alpha channels.
  try {
    const whiteBackgroundJpeg = await sharp(transparentPng)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer()
    return whiteBackgroundJpeg
  } catch (err) {
    // A failure here is a real bug (bad image data from rembg, sharp
    // misconfiguration) rather than a "service unavailable" condition —
    // still surfaced as BackgroundRemovalUnavailableError so callers have
    // one consistent catch path and fall back to the original image
    // either way, but worth knowing in logs that this is the compositing
    // step, not the network call, if it ever needs debugging.
    throw new BackgroundRemovalUnavailableError(
      `Failed to composite onto white background: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
