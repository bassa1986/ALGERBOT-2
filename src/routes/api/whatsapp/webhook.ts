// WhatsApp Cloud API webhook -- receives (1) Meta's one-time GET
// verification handshake when you register this URL, and (2) POSTed
// events afterward. This app cares about one event: a completed order
// Flow, delivered as a special interactive.nfm_reply message. On
// completion, this looks up the accumulated session state (see
// whatsapp_flow_sessions, migration 0013) by flow_token and calls the
// SAME createOrder() the web checkout uses -- full server-side
// price/stock re-validation, nothing from the Flow trusted as final.
//
// Register this URL in the Meta App Dashboard (WhatsApp > Configuration >
// Webhook) as:
//   https://<your-domain>/api/whatsapp/webhook
// with the Verify Token set to WHATSAPP_WEBHOOK_VERIFY_TOKEN's value.

import { createFileRoute } from '@tanstack/react-router'
import { sql } from '~/lib/db'
import { createOrder } from '~/server/checkout'
import { sendTextMessage } from '~/lib/whatsapp-cloud-api'
import { checkRateLimit } from '~/lib/rate-limit'
import { verifyWebhookSignature } from '~/lib/crypto'

interface IncomingMessage {
  from: string
  type: string
  interactive?: {
    type: string
    nfm_reply?: {
      response_json: string
      body: string
      name: string
    }
  }
}

interface WebhookPayload {
  entry?: {
    changes?: {
      value?: {
        messages?: IncomingMessage[]
      }
    }[]
  }[]
}

interface SessionState {
  product_id?: string
  variant_id?: string | null
  quantity?: number
  buyer_name?: string
  buyer_phone?: string
  wilaya_code?: number
  commune?: string
  address?: string
  notes?: string
}

async function handleFlowCompletion(message: IncomingMessage) {
  const nfmReply = message.interactive?.nfm_reply
  if (!nfmReply) return

  let responseData: { flow_token?: string }
  try {
    responseData = JSON.parse(nfmReply.response_json)
  } catch {
    console.error('[whatsapp-webhook] could not parse nfm_reply.response_json')
    return
  }

  const flowToken = responseData.flow_token
  if (!flowToken) {
    console.error('[whatsapp-webhook] flow completion with no flow_token')
    return
  }

  // Stale claims (a previous attempt crashed after claiming but before
  // either writing order_id or releasing the claim on failure) are
  // reclaimable after this window, so a permanently-stuck session can't
  // result from a mid-flight crash.
  const CLAIM_STALE_MS = 2 * 60 * 1000

  // Atomically claim this session: a single UPDATE...WHERE...RETURNING is
  // one statement, so Postgres serializes concurrent attempts against the
  // same row itself -- only the request whose UPDATE actually matched the
  // WHERE clause gets a row back in RETURNING. This replaces a previous
  // plain "SELECT, check order_id in application code, then call
  // createOrder" -- which two near-simultaneous webhook redeliveries for
  // the SAME flow_token (Meta retries aggressively on anything but an
  // instant 200) could both pass before either had written order_id,
  // causing createOrder() -- and its stock decrement -- to run twice for
  // one buyer session.
  const claimRows = await sql<{ storeSlug: string; state: SessionState }[]>`
    UPDATE whatsapp_flow_sessions
    SET claimed_at = now()
    WHERE flow_token = ${flowToken}
      AND order_id IS NULL
      AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => ${CLAIM_STALE_MS / 1000}))
    RETURNING store_slug, state
  `
  const session = claimRows[0]
  if (!session) {
    // Three possible reasons, all of which are correctly a silent no-op
    // here: (1) no session exists for this flow_token, (2) the order was
    // already placed (order_id is set), or (3) another concurrent
    // delivery holds a fresh, non-stale claim on it right now.
    return
  }

  const s = session.state
  if (!s.product_id || !s.quantity || !s.buyer_name || !s.buyer_phone || !s.wilaya_code || !s.commune || !s.address) {
    console.error(`[whatsapp-webhook] incomplete session state for flow_token ${flowToken}`, s)
    return
  }

  try {
    const order = await createOrder({
      storeSlug: session.storeSlug,
      items: [{ productId: s.product_id, variantId: s.variant_id ?? null, quantity: s.quantity }],
      buyerName: s.buyer_name,
      buyerPhone: s.buyer_phone,
      buyerWilayaCode: s.wilaya_code,
      buyerCommune: s.commune,
      buyerAddress: s.address,
      buyerNotes: s.notes,
      sourceChannel: 'whatsapp',
    })

    await sql`UPDATE whatsapp_flow_sessions SET order_id = ${order.orderId}, updated_at = now() WHERE flow_token = ${flowToken}`
  } catch (err) {
    // createOrder can legitimately fail here even though the REVIEW
    // screen showed a successful preview moments earlier — e.g. stock
    // sold out in between, or the store got unpublished. The Flow has
    // already closed on the buyer's end by this point, so a plain
    // WhatsApp text is the only way left to tell them — safe to send
    // free-form here (not a Template) because this fires immediately
    // after the buyer's own Flow-completion message, which is itself
    // inside Meta's 24-hour customer service window (see sendTextMessage's
    // doc comment for why that constraint matters elsewhere).
    console.error(`[whatsapp-webhook] createOrder failed for flow_token ${flowToken}`, err)

    // Release the claim immediately (rather than waiting out
    // CLAIM_STALE_MS) so a legitimate retry -- another webhook
    // redelivery, or the buyer completing the Flow again -- can attempt
    // this session again right away instead of being blocked for up to
    // 2 minutes.
    await sql`UPDATE whatsapp_flow_sessions SET claimed_at = NULL WHERE flow_token = ${flowToken}`

    const reason = err instanceof Error ? err.message : 'Une erreur est survenue'
    try {
      await sendTextMessage(
        message.from,
        `Désolé, votre commande n'a pas pu être finalisée : ${reason}. ` +
          `Veuillez réessayer ou contacter directement le vendeur.`,
      )
    } catch (notifyErr) {
      // A failure to send the failure notification is logged, not
      // rethrown — there is nothing further this handler can do, and the
      // webhook must still return 200 to Meta regardless (see the POST
      // handler below).
      console.error(`[whatsapp-webhook] failed to notify buyer for flow_token ${flowToken}`, notifyErr)
    }
  }
}

export const Route = createFileRoute('/api/whatsapp/webhook')({
  server: {
    handlers: {
      // Meta's one-time verification handshake -- see module comment.
      GET: async ({ request }) => {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        if (!checkRateLimit('whatsapp-webhook-verify', clientIp, 10, 60_000)) {
          return new Response('Too many requests', { status: 429 })
        }

        const url = new URL(request.url)
        const mode = url.searchParams.get('hub.mode')
        const token = url.searchParams.get('hub.verify_token')
        const challenge = url.searchParams.get('hub.challenge')

        const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

        if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
          // Meta requires the raw challenge value as plain text -- not JSON.
          return new Response(challenge, { status: 200 })
        }
        return new Response('Forbidden', { status: 403 })
      },

      // Actual event delivery, once subscribed.
      POST: async ({ request }) => {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        // Generous limit -- this is genuine traffic from Meta on a busy
        // store, not a per-buyer action -- but still capped, since the
        // URL is public and this must not be an unbounded amplification
        // vector if it ever leaks or is guessed.
        if (!checkRateLimit('whatsapp-webhook-event', clientIp, 120, 60_000)) {
          return new Response('Too many requests', { status: 429 })
        }

        // Read the raw body ONCE, as text, before any JSON parsing --
        // signature verification must run against the exact bytes Meta
        // sent; re-serializing a parsed object would silently break
        // every signature check (different whitespace/key order).
        const rawBody = await request.text()

        const appSecret = process.env.WHATSAPP_APP_SECRET
        if (appSecret) {
          const signatureHeader = request.headers.get('x-hub-signature-256')
          const isValid = await verifyWebhookSignature(rawBody, signatureHeader, appSecret)
          if (!isValid) {
            console.error('[whatsapp-webhook] invalid or missing X-Hub-Signature-256')
            return new Response('Invalid signature', { status: 401 })
          }
        } else {
          // No app secret configured -- this should only be true in local
          // dev before Meta credentials exist (see .env.example). Logged
          // loudly rather than silently accepting unverified webhooks in
          // a deployment that simply forgot to set this.
          console.warn(
            '[whatsapp-webhook] WHATSAPP_APP_SECRET not set -- accepting webhook WITHOUT signature verification. Set this before going to production.',
          )
        }

        let payload: WebhookPayload
        try {
          payload = JSON.parse(rawBody)
        } catch {
          // Acknowledge anyway -- Meta retries on non-2xx, and a
          // malformed body isn't something a retry would fix.
          return new Response('OK', { status: 200 })
        }

        const messages = payload.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []) ?? []

        for (const message of messages) {
          if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
            await handleFlowCompletion(message)
          }
          // Other message types (plain text replies, etc.) aren't handled
          // yet -- this webhook currently only cares about completed Flows.
        }

        // Must respond 200 quickly (Meta retries aggressively on
        // failure/timeout) -- the work above is intentionally lightweight
        // for this reason.
        return new Response('OK', { status: 200 })
      },
    },
  },
})
