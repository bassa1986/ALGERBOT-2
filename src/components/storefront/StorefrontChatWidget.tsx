import { useState } from 'react'
import type { PublicStore } from '~/server/storefront-public'
import { buildMerchantTelegramLink } from '~/lib/telegram-links'
import { buildMerchantWhatsAppLink } from '~/lib/whatsapp-links'
import { useLocale } from '~/lib/i18n/LocaleContext'

/**
 * A floating "chat with us" bubble, present on every page of a store
 * (mounted at the /s/$slug layout level, not per-page) -- so a buyer
 * mid-checkout with a question can reach the merchant without losing
 * their place. Tapping it opens a small in-page panel listing whichever
 * channels the merchant has configured; tapping a channel hands off to
 * the real WhatsApp/Telegram app or web client via the existing
 * wa.me/t.me link builders.
 *
 * IMPORTANT -- this is a launcher, not embedded messaging: neither
 * WhatsApp nor Telegram offers a way to send/receive messages inside an
 * arbitrary third-party webpage (confirmed earlier in this project). The
 * panel's job is to make the existing contact channels easy to find
 * while browsing, not to replace them with true in-page chat.
 *
 * Renders nothing at all if the merchant has configured neither channel
 * -- never an empty floating bubble.
 */
export function StorefrontChatWidget({ store }: { store: PublicStore }) {
  const { t, dir } = useLocale()
  const [isOpen, setIsOpen] = useState(false)

  const hasTelegram = Boolean(store.merchantTelegramUsername)
  const hasWhatsapp = Boolean(store.merchantWhatsappNumber)
  if (!hasTelegram && !hasWhatsapp) return null

  const side = dir === 'rtl' ? 'start-4' : 'end-4'

  return (
    <div className={`fixed bottom-4 ${side} z-40`}>
      {isOpen && (
        <div className="mb-3 w-64 rounded-2xl bg-[var(--color-surface)] p-3 shadow-lg border border-[var(--color-border)]">
          <p className="mb-2 px-1 text-xs font-bold text-[var(--color-text-primary)]">{t.chatWidgetTitle}</p>
          <div className="flex flex-col gap-2">
            {hasWhatsapp && (
              <a
                href={buildMerchantWhatsAppLink(store.merchantWhatsappNumber!, `${t.share.defaultShareText} — ${store.name}`)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 rounded-xl bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"
              >
                <WhatsAppGlyph className="h-5 w-5 shrink-0" />
                {t.visitMerchantWhatsApp}
              </a>
            )}
            {hasTelegram && (
              <a
                href={buildMerchantTelegramLink(store.merchantTelegramUsername!)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 rounded-xl bg-[#229ED9] px-3 py-2 text-sm font-semibold text-white"
              >
                <TelegramGlyph className="h-5 w-5 shrink-0" />
                {t.visitMerchantTelegram}
              </a>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={t.chatWidgetTitle}
        aria-expanded={isOpen}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-action-primary)] text-white shadow-lg"
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </div>
  )
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.44 1.32 4.94L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91S17.5 2 12.04 2zm5.79 14.13c-.24.68-1.4 1.3-1.93 1.35-.5.05-1.05.07-1.7-.11a13.5 13.5 0 0 1-4.8-2.85 12 12 0 0 1-2.3-3.2c-.35-.6-.6-1.3-.5-2.05.1-.65.65-1.1 1-1.4.2-.18.44-.18.66-.05l1.35.9c.2.13.3.34.28.58l-.1 1.15c-.02.2.03.4.16.55.4.5 1.05 1.2 1.75 1.7.5.35 1.05.6 1.6.75.2.05.4 0 .55-.15l.75-.85c.15-.17.4-.22.6-.12l1.4.65c.25.12.3.4.24.65z" />
    </svg>
  )
}

function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M21.5 4.5 2.7 11.9c-.9.36-.9 1.65.06 1.94l4.6 1.4 1.78 5.68c.24.75 1.2.94 1.72.35l2.4-2.72 4.68 3.44c.75.55 1.83.15 2.02-.76l3-14.4c.22-1.06-.88-1.86-1.46-1.33z" />
    </svg>
  )
}
