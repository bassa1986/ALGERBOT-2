-- Tracks one in-progress or completed WhatsApp order Flow session. Meta's
-- Flow Data Endpoint calls are stateless per-request -- each screen only
-- sends the fields submitted on THAT screen, not the accumulated data
-- from earlier screens in the same session -- so this app must persist
-- the running order state itself across the multi-screen flow
-- (PRODUCT_LIST -> PRODUCT_DETAILS -> DELIVERY_INFO -> REVIEW), keyed by
-- the flow_token this app generates when sending the Flow message (see
-- sendProductBrowseFlow in src/lib/whatsapp-flow.ts). The same flow_token
-- is echoed back on every request for that session, all the way through
-- to the final webhook notification, so it's the natural session key.
CREATE TABLE whatsapp_flow_sessions (
  flow_token TEXT PRIMARY KEY,
  buyer_whatsapp_number TEXT NOT NULL,
  store_slug TEXT NOT NULL,
  -- Accumulated form state as the buyer progresses through screens:
  -- product_id, variant_id, quantity, buyer_name, buyer_phone,
  -- wilaya_code, commune, address, notes. Free-form JSONB rather than
  -- fixed columns since it's filled in incrementally and only read back
  -- by this app's own code, never queried by field.
  state JSONB NOT NULL DEFAULT '{}',
  -- Set once the buyer completes the REVIEW screen and createOrder()
  -- succeeds -- NULL until then. A session with a non-null order_id is
  -- done; a webhook retry or duplicate completion is a no-op (checked
  -- against this, not re-run through createOrder()).
  order_id UUID REFERENCES orders (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
