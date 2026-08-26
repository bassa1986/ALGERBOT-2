/**
 * All storefront product/store images are uploaded once at a single
 * resolution (~1600px, per the Step 4 camera-capture pipeline) — Adex
 * doesn't generate multiple sizes server-side. What we CAN do at the
 * display layer is make sure the browser never upscales or blurs that
 * image on a high pixel-density screen (retina phones, 4K/5K monitors):
 * `sizes` tells the browser the image's real on-screen width so it can
 * decide how much of the source resolution it actually needs, and
 * `imageRendering: high-quality`-equivalent defaults are the browser's
 * responsibility once `sizes` is accurate — there is nothing further to
 * "force" beyond serving the sharpest source we have and letting the
 * browser's own high-DPI scaling do the rest.
 */
export function ResponsiveImage({
  src,
  alt,
  className,
  sizes = '(min-width: 1024px) 25vw, 50vw',
  loading = 'lazy',
}: {
  src: string
  alt: string
  className?: string
  sizes?: string
  loading?: 'lazy' | 'eager'
}) {
  return (
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      loading={loading}
      decoding="async"
      className={className}
    />
  )
}
