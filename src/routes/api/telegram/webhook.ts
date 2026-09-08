// Telegram Bot API webhook -- receives inbound messages sent TO our bot.
// The only thing this app currently needs from it: a merchant replying to
// a Negotiate chat message (see src/server/negotiation.ts) inside their
// own real Telegram app, which needs to be relayed back to the buyer's
// page.
//
// Unlike Meta's WhatsApp webhook, Telegram has no dashboard UI to
// register this URL -- it's a one-time Bot API call. See
// TELEGRAM_WEBHOOK_SECRET's comment in .env.example for the exact command.

import { createFileRoute } from '@tanstack/react-router'
import { timingSafeEqual } from 'node:crypto'
import { sql } from '~/lib/db'
import { checkRateLimit } from '~/lib/rate-limit'

interface TelegramUpdate {
  message?: {
    message_id: number
    text?: string
    from?: { id: number }
    reply_to_message?: { message_id: number }
  }
}

function isValidSecret(header: string | null, expected: string): boolean {
  if (!header) return false
  const headerBuf = Buffer.from(header)
  const expectedBuf = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch rather than returning
  // false -- length differing is itself not secret, so checking it
  // upfront is fine and avoids that throw.
  if (headerBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(headerBuf, expectedBuf)
}

async function findThreadForMerchantReply(
  telegramUserId: number,
  replyToMessageId: number | undefined,
): Promise<string | null> {
  if (replyToMessageId) {
    // Exact match: the merchant used "swipe to reply" on the specific
    // message we sent for a given thread -- see negotiation_messages'
    // external_message_id doc comment (migration 0019) for why this is
    // the reliable path when available.
    const rows = await sql<{ threadId: string }[]>`
      SELECT nm.thread_id AS "threadId"
      FROM negotiation_messages nm
      JOIN negotiation_threads nt ON nt.id = nm.thread_id
      JOIN merchants m ON m.id = nt.merchant_id
      WHERE nm.external_message_id = ${String(replyToMessageId)}
        AND nm.sender = 'buyer' AND m.telegram_user_id = ${telegramUserId}
      LIMIT 1
    `
    if (rows[0]) return rows[0].threadId
  }

  // Fallback: no reply-to (or it didn't match anything of ours) -- best
  // guess is this merchant's most recently active open Telegram thread.
  // Wrong if they're juggling multiple concurrent buyers and reply out of
  // order without using reply-to -- an accepted, documented limitation
  // (see src/server/negotiation.ts's module comment).
  const fallbackRows = await sql<{ threadId: string }[]>`
    SELECT nt.id AS "threadId"
    FROM negotiation_threads nt
    JOIN merchants m ON m.id = nt.merchant_id
    WHERE m.telegram_user_id = ${telegramUserId} AND nt.channel = 'telegram' AND nt.status = 'open'
    ORDER BY nt.last_message_at DESC
    LIMIT 1
  `
  return fallbackRows[0]?.threadId ?? null
}

export const Route = createFileRoute('/api/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        if (!checkRateLimit('telegram-webhook-event', clientIp, 120, 60_000)) {
          return new Response('Too many requests', { status: 429 })
        }

        const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
        if (expectedSecret) {
          const header = request.headers.get('x-telegram-bot-api-secret-token')
          if (!isValidSecret(header, expectedSecret)) {
            console.error('[telegram-webhook] invalid or missing secret token')
            return new Response('Forbidden', { status: 403 })
          }
        } else {
          console.warn(
            '[telegram-webhook] TELEGRAM_WEBHOOK_SECRET not set -- accepting webhook WITHOUT verification. Set this before going to production.',
          )
        }

        let update: TelegramUpdate
        try {
          update = JSON.parse(await request.text())
        } catch {
          return new Response('OK', { status: 200 })
        }

        const message = update.message
        if (message?.text && message.from) {
          try {
            const threadId = await findThreadForMerchantReply(message.from.id, message.reply_to_message?.message_id)
            if (threadId) {
              await sql`
                INSERT INTO negotiation_messages (thread_id, sender, body, delivery_status, external_message_id)
                VALUES (${threadId}, 'merchant', ${message.text}, 'sent', ${String(message.message_id)})
              `
              await sql`UPDATE negotiation_threads SET last_message_at = now() WHERE id = ${threadId}`
            }
            // No matching thread at all (merchant messaging the bot about
            // something unrelated to Negotiate, e.g. their own login) --
            // correctly ignored, nothing to relay.
          } catch (err) {
            console.error('[telegram-webhook] failed to record merchant reply', err)
          }
        }

        return new Response('OK', { status: 200 })
      },
    },
  },
})
