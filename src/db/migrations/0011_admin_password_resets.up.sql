-- Enforces "at most one admin account, ever" at the database level. A
-- unique index on a constant expression means Postgres itself rejects a
-- second INSERT the instant it would violate uniqueness -- atomic, so it
-- can't be raced the way an app-level "SELECT COUNT(*) then INSERT" check
-- could be under concurrent requests. This does NOT prevent updating or
-- deleting the existing admin -- only having more than one row at once.
CREATE UNIQUE INDEX admins_singleton_idx ON admins ((true));

-- One-time, short-lived tokens for the admin "forgot password" flow. Only
-- the SHA-256 hash of the token is stored (never the raw token) — same
-- pattern as the sessions table — so a DB read alone can't be used to
-- reset someone's password.
CREATE TABLE admin_password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_password_resets_admin_id_idx ON admin_password_resets (admin_id);
