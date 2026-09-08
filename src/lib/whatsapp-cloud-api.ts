// Minimal WhatsApp Cloud API client — sends messages via Meta's Graph API
// over plain HTTPS (fetch), no SDK. Reads credentials from env vars, same
// pluggable-via-env approach as src/lib/email.ts: if WHATSAPP_* isn't
// configured, calls log a warning and no-op rather than throwing, so the
// app keeps working before Meta credentials exist.
//
// Required env vars (see .env.example):
//   WHATSAPP_PHONE_NUMBER_ID  — from Meta App Dashboard > WhatsApp > API Setup
//   WHATSAPP_ACCESS_TOKEN     — a permanent (System User) access token
//   WHATSAPP_FLOW_ID          — the published Flow's ID, once created in Flow Builder
//   WHATSAPP_API_VERSION      — optional, defaults to a recent Graph API version

const DEFAULT_API_VERSION = 'v21.0'

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const apiVersion = process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION
  if (!phoneNumberId || !accessToken) return null
  return { phoneNumberId, accessToken, apiVersion }
}

interface SendFlowMessageInput {
  /** Buyer's WhatsApp number, digits only, country code first (same format as wa.me links). */
  to: string
  flowId: string
  /** Shown as the message body above the "open flow" button. */
  headerText: string
  bodyText: string
  /** Label on the button that opens the Flow. */
  ctaLabel: string
  /** Opaque token round-tripped through the Flow's Data Endpoint calls and the final webhook — put your own correlation id here (e.g. `store:<slug>:product:<id>`). */
  flowToken: string
  /** The Flow's first screen id, and any data it needs to render immediately. */
  screen: string
  screenData?: Record<string, unknown>
}

/**
 * Sends an interactive Flow message to a buyer's WhatsApp number. No-ops
 * with a console warning if WHATSAPP_* env vars aren't set, so callers can
 * invoke this unconditionally without checking configuration first.
 */
export async function sendFlowMessage(input: SendFlowMessageInput): Promise<void> {
  const config = getConfig()
  if (!config) {
    console.warn(`[whatsapp] WHATSAPP_* env vars not set — not sending. Would have sent a Flow to ${input.to}.`)
    return
  }

  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: input.headerText },
        body: { text: input.bodyText },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: input.flowToken,
            flow_id: input.flowId,
            flow_cta: input.ctaLabel,
            flow_action: 'navigate',
            flow_action_payload: {
              screen: input.screen,
              data: input.screenData ?? {},
            },
          },
        },
      },
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`WhatsApp Cloud API error (${res.status}): ${errorBody}`)
  }
}

/**
 * Sends a plain text message. IMPORTANT constraint from Meta: this only
 * works within the 24-hour "customer service window" after the recipient
 * last messaged the business — outside that window, Meta rejects free-form
 * text and requires a pre-approved message Template instead. Safe to use
 * for the order-failure notification (webhook.ts) because it fires
 * immediately after the buyer's own Flow completion message, which is
 * itself inside that window. Do not reuse this for messages sent long
 * after the triggering user action without checking that constraint.
 *
 * Returns the Cloud API's message id ("wamid...") on success, or null if
 * WHATSAPP_* isn't configured (existing callers that ignore the return
 * value are unaffected). Used by src/server/negotiation.ts to record
 * which of our outbound messages a merchant's later "swipe to reply"
 * is replying to.
 */
export async function sendTextMessage(to: string, body: string): Promise<string | null> {
  const config = getConfig()
  if (!config) {
    console.warn(`[whatsapp] WHATSAPP_* env vars not set — not sending. Would have sent a text to ${to}: "${body}"`)
    return null
  }

  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body },
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`WhatsApp Cloud API error (${res.status}): ${errorBody}`)
  }

  const data = (await res.json()) as { messages?: { id: string }[] }
  return data.messages?.[0]?.id ?? null
}

/**
 * Sends the "a buyer wants to negotiate" notification to a MERCHANT's
 * WhatsApp number to start a negotiation thread (see
 * src/server/negotiation.ts). This is a business-INITIATED conversation —
 * the merchant hasn't necessarily messaged our business number recently,
 * so sendTextMessage's free-form path would be rejected outside any
 * existing 24h window. Meta requires a pre-approved Template for this,
 * the same constraint as sendAuthenticationTemplate above.
 *
 * REQUIRES SETUP ON META'S SIDE THIS CODE CANNOT DO FOR YOU: create a
 * Utility or Marketing-category template (Meta Business Manager > Account
 * tools > Message templates) with a single body variable for the buyer's
 * opening message, get it approved, and set its name in
 * WHATSAPP_NEGOTIATION_TEMPLATE_NAME / WHATSAPP_NEGOTIATION_TEMPLATE_LANGUAGE.
 * Until that template exists and is approved, sends will fail — the
 * caller (startNegotiationThread) stores the thread/message either way
 * and marks delivery as failed rather than losing the buyer's message,
 * so nothing needs to change in this app once the template is approved;
 * delivery just starts succeeding.
 */
export async function sendNegotiationStartTemplate(to: string, buyerMessage: string): Promise<string | null> {
  const config = getConfig()
  const templateName = process.env.WHATSAPP_NEGOTIATION_TEMPLATE_NAME
  const templateLanguage = process.env.WHATSAPP_NEGOTIATION_TEMPLATE_LANGUAGE || 'fr'
  if (!config || !templateName) {
    console.warn(
      `[whatsapp] WHATSAPP_* / WHATSAPP_NEGOTIATION_TEMPLATE_NAME env vars not set — not sending negotiation start to ${to}.`,
    )
    return null
  }

  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [{ type: 'body', parameters: [{ type: 'text', text: buyerMessage }] }],
      },
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    // Deliberately not thrown further than a log here — the caller needs
    // to record delivery_status='failed' and move on, not blow up the
    // buyer-facing request, since this can fail for a reason entirely
    // outside our control (template not yet approved by Meta).
    console.error(`[whatsapp] sendNegotiationStartTemplate failed (${res.status}): ${errorBody}`)
    return null
  }

  const data = (await res.json()) as { messages?: { id: string }[] }
  return data.messages?.[0]?.id ?? null
}
 * template — the ONLY Meta-compliant way to deliver a one-time
 * passcode over WhatsApp. Plain free-form text (sendTextMessage above)
 * is explicitly disallowed for this by Meta's own policy, and doesn't
 * even work outside the 24-hour customer-service window, which a
 * merchant logging in has usually not opened (they haven't necessarily
 * messaged the business number recently) — so this is not optional
 * for this use case, unlike the failure-notification use of
 * sendTextMessage elsewhere in this app.
 *
 * REQUIRES SETUP ON META'S SIDE THAT THIS CODE CANNOT DO FOR YOU: create
 * an Authentication-category template (Meta Business Manager > Account
 * tools > Message templates > Create template > Authentication) with a
 * Copy Code OTP button, get it approved (usually near-instant once your
 * business is verified, otherwise up to 24-48h), and set its name/
 * language in WHATSAPP_OTP_TEMPLATE_NAME / WHATSAPP_OTP_TEMPLATE_LANGUAGE.
 * Until that template exists and is approved, this call will fail —
 * logged clearly rather than silently swallowed, since a merchant unable
 * to log in needs this to be loud, not quiet.
 */
export async function sendAuthenticationTemplate(to: string, code: string): Promise<void> {
  const config = getConfig()
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME
  const templateLanguage = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || 'fr'
  if (!config || !templateName) {
    console.warn(
      `[whatsapp] WHATSAPP_* / WHATSAPP_OTP_TEMPLATE_NAME env vars not set — not sending OTP to ${to}.`,
    )
    return
  }

  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          // Per Meta's documented format, the code must appear TWICE:
          // once in the body (renders as "<code> is your verification
          // code"), once in the button so tapping "Copy Code" copies the
          // right value.
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`WhatsApp Cloud API error sending OTP template (${res.status}): ${errorBody}`)
  }
}
