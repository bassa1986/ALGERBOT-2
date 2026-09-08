import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { sql } from '~/lib/db'
import { publicRateLimit, publicReadRateLimit } from '~/lib/rate-limit'
import { getOrCreateNegotiationBuyerToken, readNegotiationBuyerToken } from '~/lib/negotiation-cookie'
import { sendTextMessage, sendNegotiationStartTemplate } from '~/lib/whatsapp-cloud-api'
import { sendTelegramMessage } from '~/lib/telegram-notify'

// The "Negotiate" chat: a buyer sends a free-form message from our own
// page, relayed OUT to the merchant's real WhatsApp/Telegram (so the
// merchant's own experience is completely unchanged — they get a real
// message in their own app, and reply there as normal). The merchant's
// reply is picked up by our WhatsApp/Telegram webhooks (see
// src/routes/api/whatsapp/webhook.ts and src/routes/api/telegram/webhook.ts)
// and relayed back IN to the buyer's page via polling (listNegotiationMessages).
//
// This is deliberately NOT "embedded WhatsApp/Telegram" — that doesn't
// exist as a capability on either platform for any third-party website.
// It's a custom chat UI of our own, using their APIs purely as a message
// transport in both directions.
//
// Real, un-fixable platform constraints this design works around as best
// it can (documented here once rather than repeated at every call site):
//   - WhatsApp requires a pre-approved Template to message a merchant who
//     hasn't messaged our business number within the last 24h (see
//     sendNegotiationStartTemplate's doc comment). A buyer's first message
//     in a thread always needs the template; whether FOLLOW-UP messages
//     can be sent as free text depends on whether the merchant has replied
//     yet (that's what actually opens the 24h window — not our own send).
//   - Matching a merchant's reply back to the correct thread is
//     best-effort: exact if the merchant uses "swipe to reply" on our
//     message (both platforms echo back a reference id for that), else we
//     fall back to "this merchant's most recently active open thread on
//     this channel", which can be wrong if they have several buyers
//     negotiating at once and reply out of order without using reply-to.

const channelSchema = z.enum(['whatsapp', 'telegram'])

interface NegotiationTarget {
  storeId: string
  merchantId: string
  telegramUserId: number
  whatsappNumber: string | null
}

async function loadNegotiationTarget(storeSlug: string, productId: string): Promise<NegotiationTarget> {
  const rows = await sql<NegotiationTarget[]>`
    SELECT s.id AS "storeId", s.merchant_id AS "merchantId",
           m.telegram_user_id AS "telegramUserId", m.whatsapp_number AS "whatsappNumber"
    FROM stores s
    JOIN merchants m ON m.id = s.merchant_id
    JOIN subscriptions sub ON sub.merchant_id = s.merchant_id
    JOIN products p ON p.store_id = s.id
    WHERE s.slug = ${storeSlug} AND p.id = ${productId}
      AND s.is_published = true AND sub.current_period_expires_at > now()
      AND m.status != 'suspended'
  `
  const target = rows[0]
  if (!target) throw new Error('Boutique ou produit introuvable')
  return target
}

async function loadThreadForBuyer(threadId: string, buyerToken: string) {
  const rows = await sql<
    { id: string; merchantId: string; channel: 'whatsapp' | 'telegram'; buyerToken: string; status: string }[]
  >`
    SELECT id, merchant_id AS "merchantId", channel, buyer_token AS "buyerToken", status
    FROM negotiation_threads WHERE id = ${threadId}
  `
  const thread = rows[0]
  if (!thread || thread.buyerToken !== buyerToken) throw new Error('Conversation introuvable')
  return thread
}

const getOrCreateThreadSchema = z.object({
  storeSlug: z.string(),
  productId: z.string().uuid(),
  channel: channelSchema,
})

/**
 * Resolves (creating if needed) the thread for this browser + product +
 * channel, and returns its existing messages. Deliberately does NOT send
 * anything — opening the Negotiate sheet and picking a channel shouldn't
 * itself message the merchant; that only happens once the buyer actually
 * types and sends something (sendNegotiationMessage below).
 */
export const getOrCreateNegotiationThread = createServerFn({ method: 'POST' })
  .middleware([publicReadRateLimit])
  .validator(getOrCreateThreadSchema)
  .handler(async ({ data }) => {
    const target = await loadNegotiationTarget(data.storeSlug, data.productId)
    if (data.channel === 'whatsapp' && !target.whatsappNumber) {
      throw new Error("Ce vendeur n'a pas configuré WhatsApp")
    }

    const buyerToken = getOrCreateNegotiationBuyerToken()

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM negotiation_threads
      WHERE buyer_token = ${buyerToken} AND product_id = ${data.productId} AND channel = ${data.channel}
      ORDER BY created_at DESC LIMIT 1
    `

    const threadId =
      existing[0]?.id ??
      (
        await sql<{ id: string }[]>`
        INSERT INTO negotiation_threads (store_id, merchant_id, product_id, buyer_token, channel)
        VALUES (${target.storeId}, ${target.merchantId}, ${data.productId}, ${buyerToken}, ${data.channel})
        RETURNING id
      `
      )[0].id

    const messages = await sql<{ id: string; sender: string; body: string; deliveryStatus: string; createdAt: Date }[]>`
      SELECT id, sender, body, delivery_status AS "deliveryStatus", created_at AS "createdAt"
      FROM negotiation_messages WHERE thread_id = ${threadId} ORDER BY created_at ASC
    `

    return { threadId, messages }
  })

const sendMessageSchema = z.object({
  threadId: z.string().uuid(),
  message: z.string().trim().min(1).max(1000),
})

export const sendNegotiationMessage = createServerFn({ method: 'POST' })
  .middleware([publicRateLimit])
  .validator(sendMessageSchema)
  .handler(async ({ data }) => {
    const buyerToken = readNegotiationBuyerToken()
    if (!buyerToken) throw new Error('Conversation introuvable')
    const thread = await loadThreadForBuyer(data.threadId, buyerToken)
    if (thread.status !== 'open') throw new Error('Cette conversation est fermée')

    const priorCount = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM negotiation_messages
      WHERE thread_id = ${data.threadId} AND sender = 'buyer'
    `
    const isFirstBuyerMessage = priorCount[0].count === '0'

    const merchantRows = await sql<{ telegramUserId: number; whatsappNumber: string | null }[]>`
      SELECT telegram_user_id AS "telegramUserId", whatsapp_number AS "whatsappNumber"
      FROM merchants WHERE id = ${thread.merchantId}
    `
    const merchant = merchantRows[0]
    if (!merchant) throw new Error('Vendeur introuvable')

    let externalMessageId: string | null = null
    let deliveryStatus: 'sent' | 'failed' = 'failed'

    try {
      if (thread.channel === 'telegram') {
        const messageId = await sendTelegramMessage(merchant.telegramUserId, data.message)
        if (messageId !== null) {
          externalMessageId = String(messageId)
          deliveryStatus = 'sent'
        }
      } else if (thread.channel === 'whatsapp' && merchant.whatsappNumber) {
        // First message in the thread MUST use the pre-approved template
        // (business-initiated, merchant hasn't necessarily messaged us
        // recently). Follow-ups attempt free text, which only succeeds if
        // the merchant has replied at least once by now (that's what
        // actually opens Meta's 24h window) — if it fails, the message is
        // still saved so the merchant sees it whenever they do open the
        // thread, it just won't have pushed as a live notification.
        const messageId = isFirstBuyerMessage
          ? await sendNegotiationStartTemplate(merchant.whatsappNumber, data.message)
          : await sendTextMessage(merchant.whatsappNumber, data.message)
        if (messageId !== null) {
          externalMessageId = messageId
          deliveryStatus = 'sent'
        }
      }
    } catch (err) {
      console.error('[negotiation] relay send failed', err)
    }

    const inserted = await sql<{ id: string; createdAt: Date }[]>`
      INSERT INTO negotiation_messages (thread_id, sender, body, delivery_status, external_message_id)
      VALUES (${data.threadId}, 'buyer', ${data.message}, ${deliveryStatus}, ${externalMessageId})
      RETURNING id, created_at AS "createdAt"
    `
    await sql`UPDATE negotiation_threads SET last_message_at = now() WHERE id = ${data.threadId}`

    return { id: inserted[0].id, deliveryStatus, createdAt: inserted[0].createdAt }
  })

const listMessagesSchema = z.object({ threadId: z.string().uuid() })

export const listNegotiationMessages = createServerFn({ method: 'GET' })
  .middleware([publicReadRateLimit])
  .validator(listMessagesSchema)
  .handler(async ({ data }) => {
    const buyerToken = readNegotiationBuyerToken()
    if (!buyerToken) throw new Error('Conversation introuvable')
    await loadThreadForBuyer(data.threadId, buyerToken)

    const messages = await sql<{ id: string; sender: string; body: string; deliveryStatus: string; createdAt: Date }[]>`
      SELECT id, sender, body, delivery_status AS "deliveryStatus", created_at AS "createdAt"
      FROM negotiation_messages WHERE thread_id = ${data.threadId} ORDER BY created_at ASC
    `
    return { messages }
  })
