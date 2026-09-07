import { useLocale } from '~/lib/i18n/LocaleContext'

/**
 * "Negotiate" channel picker, as a fixed full-screen overlay sheet —
 * deliberately NOT a small `position: absolute` dropdown anchored to the
 * button, and deliberately rendered as a SIBLING of the product card's
 * <Link> in ProductCard.tsx, not a descendant of it.
 *
 * Why: the product card's outer <Link> has `overflow-hidden` (needed to
 * clip the cover image to the card's rounded corners). An absolutely-
 * positioned dropdown living inside that Link gets silently clipped by
 * that same overflow-hidden the moment it extends past the card's own
 * bottom edge — which it does here, since the Negotiate button sits near
 * the bottom of the card. The dropdown WAS toggling open (state worked
 * fine), it was just invisible, which looked identical to "the button
 * does nothing" from a buyer's perspective. ShareSheet.tsx already solved
 * this exact problem the same way — this mirrors that pattern instead of
 * inventing a new one.
 */
export function NegotiateSheet({
  isOpen,
  onClose,
  hasWhatsapp,
  hasTelegram,
  onWhatsApp,
  onTelegram,
  telegramMessageCopied,
}: {
  isOpen: boolean
  onClose: () => void
  hasWhatsapp: boolean
  hasTelegram: boolean
  onWhatsApp: () => void
  onTelegram: () => void | Promise<void>
  /** True once the Telegram button has been tapped and the product
   * message was copied to the clipboard (or attempted to be) — shown as
   * an inline confirmation instead of closing the sheet immediately, so
   * the buyer sees the "paste it" instruction before the sheet vanishes.
   * See ProductCard.tsx's handleNegotiateTelegram for why a copy step
   * exists at all: Telegram's direct personal-chat links can't pre-fill
   * a message the way WhatsApp's wa.me?text= can. */
  telegramMessageCopied: boolean
}) {
  const { t, dir } = useLocale()

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      dir={dir}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[var(--color-surface)] p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-border)]" />
        <p className="mb-3 px-1 text-sm font-bold text-[var(--color-text-primary)]">
          {t.negotiateButton}
        </p>
        <div className="flex flex-col gap-2">
          {hasWhatsapp && (
            <button
              type="button"
              onClick={onWhatsApp}
              className="w-full rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white"
            >
              {t.visitMerchantWhatsApp}
            </button>
          )}
          {hasTelegram && (
            <button
              type="button"
              onClick={onTelegram}
              className="w-full rounded-full bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white"
            >
              {t.visitMerchantTelegram}
            </button>
          )}
          {telegramMessageCopied && (
            <p className="px-1 pt-1 text-center text-xs text-[var(--color-text-muted)]">
              {t.negotiateTelegramCopiedHint}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
