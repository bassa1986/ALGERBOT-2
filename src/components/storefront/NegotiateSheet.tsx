import { useEffect, useRef, useState } from 'react'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { getOrCreateNegotiationThread, sendNegotiationMessage, listNegotiationMessages } from '~/server/negotiation'

interface NegotiationMessage {
  id: string
  sender: 'buyer' | 'merchant'
  body: string
  deliveryStatus: 'pending' | 'sent' | 'failed'
  createdAt: string | Date
}

const POLL_INTERVAL_MS = 4000

/**
 * "Negotiate" — a real in-page chat with the merchant, NOT a hand-off to
 * an external app. The buyer picks WhatsApp or Telegram, then chats
 * entirely inside this sheet; their messages are relayed OUT to the
 * merchant's real WhatsApp/Telegram (merchant's own experience is
 * unchanged — they just get real messages there and reply as normal),
 * and the merchant's replies are relayed back IN here via polling. See
 * src/server/negotiation.ts for the full design and its real, unfixable
 * platform constraints (WhatsApp's template/24h-window rules, and why
 * reply-matching is best-effort).
 *
 * Rendered as a SIBLING of the product card's <Link> in ProductCard.tsx,
 * not a descendant of it — see this file's git history / ProductCard.tsx
 * comment for why (the card's own overflow-hidden silently clipped an
 * earlier absolutely-positioned version of this).
 */
export function NegotiateSheet({
  isOpen,
  onClose,
  hasWhatsapp,
  hasTelegram,
  storeSlug,
  productId,
}: {
  isOpen: boolean
  onClose: () => void
  hasWhatsapp: boolean
  hasTelegram: boolean
  storeSlug: string
  productId: string
}) {
  const { t, dir } = useLocale()
  const [channel, setChannel] = useState<'whatsapp' | 'telegram' | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<NegotiationMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset to the channel-picker every time the sheet is freshly reopened,
  // rather than remembering the last channel across products/sessions.
  useEffect(() => {
    if (!isOpen) {
      setChannel(null)
      setThreadId(null)
      setMessages([])
      setDraft('')
      setError(null)
    }
  }, [isOpen])

  async function pickChannel(picked: 'whatsapp' | 'telegram') {
    setChannel(picked)
    setIsLoadingThread(true)
    setError(null)
    try {
      const result = await getOrCreateNegotiationThread({ data: { storeSlug, productId, channel: picked } })
      setThreadId(result.threadId)
      setMessages(result.messages as NegotiationMessage[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setIsLoadingThread(false)
    }
  }

  // Poll for merchant replies while the thread is open. Deliberately a
  // plain interval, not a websocket — this is a low-frequency, low-stakes
  // negotiation chat, not a real-time messaging product; a websocket
  // layer would be real added infrastructure for marginal benefit here.
  useEffect(() => {
    if (!threadId) return
    const interval = setInterval(async () => {
      try {
        const result = await listNegotiationMessages({ data: { threadId } })
        setMessages(result.messages as NegotiationMessage[])
      } catch {
        // A single missed poll isn't worth surfacing to the buyer — the
        // next tick tries again.
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [threadId])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  async function handleSend() {
    const body = draft.trim()
    if (!body || !threadId || isSending) return
    setIsSending(true)
    setError(null)
    // Optimistic append — the real row (with server-assigned id/timestamp)
    // arrives on the next poll tick and replaces this local-only view via
    // the same setMessages call above; a mismatch here is harmless since
    // it's keyed by content position, not by this temp id being reused
    // anywhere else.
    const optimisticId = `optimistic-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, sender: 'buyer', body, deliveryStatus: 'pending', createdAt: new Date() },
    ])
    setDraft('')
    try {
      await sendNegotiationMessage({ data: { threadId, message: body } })
      const result = await listNegotiationMessages({ data: { threadId } })
      setMessages(result.messages as NegotiationMessage[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} dir={dir}>
      <div
        className="flex w-full max-w-md flex-col rounded-t-2xl bg-[var(--color-surface)] p-4 pb-6"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border)]" />
        <p className="mb-3 shrink-0 px-1 text-sm font-bold text-[var(--color-text-primary)]">{t.negotiateButton}</p>

        {!channel && (
          <div className="flex flex-col gap-2">
            {hasWhatsapp && (
              <button
                type="button"
                onClick={() => pickChannel('whatsapp')}
                className="w-full rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white"
              >
                {t.visitMerchantWhatsApp}
              </button>
            )}
            {hasTelegram && (
              <button
                type="button"
                onClick={() => pickChannel('telegram')}
                className="w-full rounded-full bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white"
              >
                {t.visitMerchantTelegram}
              </button>
            )}
          </div>
        )}

        {channel && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-[var(--color-surface-muted)] p-3">
              {isLoadingThread ? (
                <p className="text-center text-xs text-[var(--color-text-muted)]">…</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.sender === 'buyer'
                          ? 'self-end bg-[var(--color-action-primary)] text-white'
                          : 'self-start bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                      }`}
                    >
                      {m.body}
                      {m.sender === 'buyer' && m.deliveryStatus === 'failed' && (
                        <div className="mt-1 text-[10px] opacity-80">{t.negotiateDeliveryFailed}</div>
                      )}
                    </div>
                  ))}
                  <div ref={scrollRef} />
                </div>
              )}
            </div>

            {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}

            <div className="mt-2 flex shrink-0 items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend()
                }}
                placeholder={t.negotiateInputPlaceholder}
                className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-primary)]"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !draft.trim()}
                className="shrink-0 rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t.negotiateSendButton}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
