-- Core auth: admins (email+password), merchants (Telegram SSO), sessions (shared table)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,      -- PBKDF2 hash, format: iterations$salt_hex$hash_hex
  full_name TEXT NOT NULL,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  telegram_photo_url TEXT,
  full_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended')),
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchants_status ON merchants (status);

-- Sessions: shared by both merchants and admins. Exactly one of merchant_id /
-- admin_id is set. Cookie carries only a signed opaque token; this row is the
-- source of truth for validity/expiry.
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of the session token, never store raw token
  merchant_id UUID REFERENCES merchants (id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admins (id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_owner_exclusive CHECK (
    (merchant_id IS NOT NULL AND admin_id IS NULL) OR
    (merchant_id IS NULL AND admin_id IS NOT NULL)
  )
);

CREATE INDEX idx_sessions_merchant ON sessions (merchant_id);
CREATE INDEX idx_sessions_admin ON sessions (admin_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
