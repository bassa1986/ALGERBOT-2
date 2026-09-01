-- Merchant-initiated plan change (upgrade/downgrade) requests, reviewed by
-- an admin before the merchant's plan_id actually changes. Kept as its own
-- table (rather than reusing billing_proofs) because a plan change has no
-- payment proof attached at request time — the admin approves the change
-- of tier itself; any price difference is settled through the existing
-- BaridiMob + billing_proofs flow on the merchant's next billing cycle.

CREATE TABLE plan_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
  current_plan_id TEXT NOT NULL REFERENCES plans (id),
  requested_plan_id TEXT NOT NULL REFERENCES plans (id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  merchant_note TEXT,
  rejection_reason TEXT,
  reviewed_by_admin_id UUID REFERENCES admins (id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_change_requests_status ON plan_change_requests (status);
CREATE INDEX idx_plan_change_requests_merchant ON plan_change_requests (merchant_id);

-- A merchant should only ever have one pending request at a time — enforced
-- via a partial unique index rather than a CHECK (Postgres can't do
-- subquery CHECKs), so a second POST while one is pending fails cleanly at
-- the DB layer as a defense-in-depth backstop to the app-level check.
CREATE UNIQUE INDEX idx_plan_change_requests_one_pending_per_merchant
  ON plan_change_requests (merchant_id)
  WHERE status = 'pending';
