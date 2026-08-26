-- Global categories (platform-wide, managed by admins), seeded by src/db/seed.ts
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories (id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_centimes INTEGER NOT NULL CHECK (price_centimes >= 0),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, sku)
);

CREATE INDEX idx_products_store ON products (store_id);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_published ON products (is_published);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  sku_suffix TEXT,               -- e.g. "RED-XL"; combined with product.sku for display
  label TEXT NOT NULL,           -- e.g. "Rouge / XL"
  price_delta_centimes INTEGER NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_product ON product_variants (product_id);

-- Cap of 6 images per product is enforced in application code (server function
-- validation before insert); a DEFERRABLE trigger constraint would work too,
-- but keeping enforcement in the server function keeps error messages clean.
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,     -- Adex object key
  url TEXT NOT NULL,             -- public CDN URL (ADEX_PUBLIC_BASE_URL + key)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_cover BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_images_product ON product_images (product_id, sort_order);

-- Every stock change (manual adjustment, order placed, order cancelled, import)
-- is logged here. delta can be negative. reason is a short machine tag,
-- note is free text (e.g. admin's manual-adjustment justification).
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'manual_adjustment', 'order_placed', 'order_cancelled', 'excel_import', 'initial_stock'
  )),
  note TEXT,
  order_id UUID,  -- set when reason is order_placed/order_cancelled; FK added in 0004
  created_by_merchant_id UUID REFERENCES merchants (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_movements_variant ON inventory_movements (variant_id);
CREATE INDEX idx_inventory_movements_created ON inventory_movements (created_at);
