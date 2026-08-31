// Single-tier plan configuration. When multi-tier pricing is introduced,
// this file becomes the natural place to expand into a Record<PlanId, ...>
// keyed off merchants.plan_id (see the scoped migration plan) — every
// consumer of these constants already reads through the functions below,
// not the raw numbers, so that future change stays contained here.

export const PLAN_MAX_PRODUCTS = 40
export const PLAN_STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024 // 1.0 GB
export const PLAN_MAX_IMAGES_PER_PRODUCT = 6 // already enforced in product-images.ts

// Raw upload guard, checked BEFORE any processing happens, to protect
// server memory from a single oversized file.
export const IMAGE_MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5MB

// Resize/compression targets for the optimization pipeline.
export const IMAGE_MAX_DIMENSION = 1200 // px, longest side
export const IMAGE_WEBP_QUALITY = 78 // targets ~150-250KB per photo
