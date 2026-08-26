CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
  tracking_code TEXT NOT NULL UNIQUE,  -- short human-friendly code for buyer lookup

  -- Guest checkout buyer info (no buyer accounts)
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  buyer_wilaya_code SMALLINT NOT NULL REFERENCES wilayas (code),
  buyer_commune TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  buyer_notes TEXT,

  -- Totals always recomputed server-side at checkout time; never trust the client.
  subtotal_centimes INTEGER NOT NULL CHECK (subtotal_centimes >= 0),
  delivery_fee_centimes INTEGER NOT NULL CHECK (delivery_fee_centimes >= 0),
  total_centimes INTEGER NOT NULL CHECK (total_centimes >= 0),

  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'confirmed', 'packed', 'handed_to_courier', 'delivered', 'paid', 'cancelled'
  )),
  cancel_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_store ON orders (store_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_buyer_phone ON orders (buyer_phone);
CREATE INDEX idx_orders_tracking_code ON orders (tracking_code);

ALTER TABLE inventory_movements
  ADD CONSTRAINT fk_inventory_movements_order
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL;

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products (id),
  variant_id UUID REFERENCES product_variants (id),
  -- Snapshot fields: product/variant may change or be deleted later, order
  -- history must stay accurate.
  product_name_snapshot TEXT NOT NULL,
  variant_label_snapshot TEXT,
  unit_price_centimes INTEGER NOT NULL CHECK (unit_price_centimes >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_centimes INTEGER NOT NULL CHECK (line_total_centimes >= 0)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- One row per checklist step transition, append-only audit trail.
CREATE TABLE order_checklist_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  step TEXT NOT NULL CHECK (step IN (
    'confirmed', 'packed', 'handed_to_courier', 'delivered', 'paid', 'cancelled'
  )),
  actor_merchant_id UUID REFERENCES merchants (id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_events_order ON order_checklist_events (order_id, created_at);
