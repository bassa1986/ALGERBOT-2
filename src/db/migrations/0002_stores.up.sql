-- Wilayas: fixed lookup table of Algeria's 58 provinces, seeded by src/db/seed.ts
CREATE TABLE wilayas (
  code SMALLINT PRIMARY KEY,        -- official 01..58 numeric code
  name_ar TEXT NOT NULL,
  name_fr TEXT NOT NULL
);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  base_wilaya_code SMALLINT REFERENCES wilayas (code),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stores_merchant ON stores (merchant_id);
CREATE INDEX idx_stores_published ON stores (is_published);

-- Per-wilaya delivery fee for a store. Absence of a row means "not delivered
-- there". Fee is in integer centimes DZD.
CREATE TABLE store_delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  wilaya_code SMALLINT NOT NULL REFERENCES wilayas (code),
  fee_centimes INTEGER NOT NULL CHECK (fee_centimes >= 0),
  UNIQUE (store_id, wilaya_code)
);

CREATE INDEX idx_delivery_zones_store ON store_delivery_zones (store_id);
