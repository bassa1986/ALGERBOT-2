-- Introduces the multi-tier plans system (Starter / Advanced / Enterprise),
-- replacing the single implicit tier that subscription_settings represented.
-- storage_limit_bytes is NULLABLE by design: Starter and Advanced are
-- capped by product count only; only Enterprise enforces a storage quota
-- (5 GB). max_products is also nullable — NULL means unlimited (Enterprise).

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_centimes INTEGER NOT NULL,
  max_products INTEGER,               -- NULL = unlimited
  max_images_per_product INTEGER NOT NULL DEFAULT 6,
  storage_limit_bytes BIGINT,         -- NULL = no storage check for this plan
  trial_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO plans (id, name, monthly_price_centimes, max_products, storage_limit_bytes, trial_days, sort_order) VALUES
  ('starter',    'Starter',    120000, 40,   NULL,       15, 1),
  ('advanced',   'Advanced',   500000, 300,  NULL,        0, 2),
  ('enterprise', 'Enterprise', 1000000, NULL, 5368709120, 0, 3); -- 5 GB

ALTER TABLE merchants
  ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'starter' REFERENCES plans(id);

-- Every existing merchant (there was only one implicit tier before this
-- migration) starts on Starter. Their existing subscriptions.
-- current_period_expires_at row is untouched by this migration, so nobody
-- loses their current billing-period access as a result of this change —
-- only NEW product/image uploads going forward are checked against
-- Starter's 40-product cap.
UPDATE merchants SET plan_id = 'starter';
