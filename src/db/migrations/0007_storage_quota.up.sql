-- Adds storage-quota tracking for the single-tier plan (1.0 GB cap, 40
-- products, enforced in application code — this migration only adds the
-- columns needed to track and check usage; it changes no existing rows,
-- constraints, or queries.

-- Running total of bytes this merchant has stored in Adex, kept in sync by
-- the upload/delete server functions (see src/lib/quota.ts). Defaulting to
-- 0 is safe for all existing merchants — their true usage will be
-- reconciled the next time the backfill script (scripts/backfill-storage-usage.ts)
-- runs, or simply accrue correctly going forward for new uploads.
ALTER TABLE merchants
  ADD COLUMN current_storage_used_bytes BIGINT NOT NULL DEFAULT 0;

-- Per-image byte size, captured once at optimize-time. Needed so that
-- deleting an image can decrement the merchant's running total by the
-- exact right amount (rather than re-deriving it from Adex on every
-- delete, which would mean an extra network round trip per delete).
ALTER TABLE product_images
  ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;
