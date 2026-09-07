-- A partial unique index (not a full UNIQUE constraint) on
-- whatsapp_number: only enforces uniqueness among NON-NULL values, so
-- merchants who haven't set a WhatsApp number (still NULL) never
-- conflict with each other. Required before WhatsApp OTP login can be
-- built on top of this column at all -- logging in "by WhatsApp number"
-- only makes sense if that number unambiguously identifies one merchant
-- account. If this fails to apply because real duplicate numbers already
-- exist in the data, resolve those manually first (this migration
-- deliberately does NOT silently pick one and clear the other's number
-- for you -- that's a decision requiring human judgment, not a safe
-- default a migration should make).
CREATE UNIQUE INDEX merchants_whatsapp_number_unique_idx ON merchants (whatsapp_number) WHERE whatsapp_number IS NOT NULL;

-- One-time codes for the WhatsApp OTP login flow. Mirrors the pattern
-- already used for admin_password_resets (migration 0011): only a hash
-- of the code is stored, never the plaintext, and each row is single-use
-- (used_at) with a short expiry.
CREATE TABLE whatsapp_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_otp_codes_number_idx ON whatsapp_otp_codes (whatsapp_number);
