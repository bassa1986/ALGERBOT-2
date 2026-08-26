-- Single row of platform-wide subscription settings, managed by admins.
-- Enforced to exactly one row via a fixed id.
CREATE TABLE subscription_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true), -- singleton row
  monthly_price_centimes INTEGER NOT NULL CHECK (monthly_price_centimes >= 0),
  free_trial_days INTEGER NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL UNIQUE REFERENCES merchants (id) ON DELETE CASCADE,
  current_period_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_expires ON subscriptions (current_period_expires_at);

-- BaridiMob receipt proof uploaded by merchant, reviewed by an admin.
-- File lives in a private Adex prefix; only ever accessed via short-lived
-- presigned GET, never a public URL.
CREATE TABLE billing_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,        -- private Adex object key (image or PDF)
  transaction_reference TEXT NOT NULL,
  declared_amount_centimes INTEGER NOT NULL CHECK (declared_amount_centimes >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_admin_id UUID REFERENCES admins (id),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_proofs_merchant ON billing_proofs (merchant_id);
CREATE INDEX idx_billing_proofs_status ON billing_proofs (status);
