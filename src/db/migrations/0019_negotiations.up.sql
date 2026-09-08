-- Backs the custom in-page "Negotiate" chat: a buyer messages a merchant
-- through our own page, relayed OUT to the merchant's real WhatsApp or
-- Telegram (so the merchant's experience is unchanged — they get a real
-- message in their own app), with the merchant's reply relayed back IN to
-- the buyer's page via polling. See src/server/negotiation.ts for the
-- full design rationale, especially around WhatsApp's template/24h-window
-- constraints and why reply-matching is best-effort, not exact.
CREATE TABLE negotiation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- Opaque random id identifying this buyer's browser (see
  -- src/lib/negotiation-cookie.ts) — buyers aren't authenticated accounts,
  -- this is the only thing tying a browser to "its" thread(s). Not a
  -- security boundary beyond "don't let one buyer read another's
  -- messages" — there's nothing sensitive enough here to warrant more.
  buyer_token TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Buyer reopening the same product's Negotiate sheet: find their existing
-- thread instead of creating a new one every time.
CREATE INDEX negotiation_threads_buyer_product_idx ON negotiation_threads (buyer_token, product_id, channel);

-- Merchant-reply matching fallback (see negotiation_messages.external_message_id
-- comment below): "most recently active open thread for this merchant on
-- this channel" when we can't match a specific reply-to reference.
CREATE INDEX negotiation_threads_merchant_channel_idx ON negotiation_threads (merchant_id, channel, status, last_message_at DESC);

CREATE TABLE negotiation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES negotiation_threads(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('buyer', 'merchant')),
  body TEXT NOT NULL,
  -- Tracks whether OUR outbound relay of this message actually reached
  -- the merchant's WhatsApp/Telegram — irrelevant for sender='merchant'
  -- rows (always 'sent', they arrived by definition). Surfaced to the
  -- buyer so a WhatsApp template rejection (e.g. not yet approved by
  -- Meta) shows as "not delivered" instead of a message that looks sent
  -- but silently vanished.
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  -- For sender='buyer': the WhatsApp wamid / Telegram message_id Meta or
  -- Telegram returned for OUR outbound send of this message — lets a
  -- merchant's native "swipe to reply" (which echoes back the id it's
  -- replying to) be matched to the exact thread it belongs to, rather
  -- than falling back to "merchant's most recent open thread" when a
  -- merchant has more than one buyer negotiating at once. Best-effort:
  -- a merchant who types a fresh message instead of using reply-to still
  -- falls back to the most-recent-thread heuristic.
  external_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX negotiation_messages_thread_idx ON negotiation_messages (thread_id, created_at);
CREATE INDEX negotiation_messages_external_idx ON negotiation_messages (external_message_id) WHERE external_message_id IS NOT NULL;
