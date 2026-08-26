-- Per-merchant storefront layout: merchant picks the template that best
-- fits their product category in store settings. 'general' is the
-- neutral default so the AlgerBot palette itself carries brand identity
-- when a merchant hasn't picked a specific variant.
CREATE TYPE store_layout_variant AS ENUM (
  'general', 'fashion', 'grocery', 'electronics', 'furniture'
);

ALTER TABLE stores
  ADD COLUMN layout_variant store_layout_variant NOT NULL DEFAULT 'general';
