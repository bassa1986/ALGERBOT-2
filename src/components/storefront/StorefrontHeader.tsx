import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { PublicStore } from '~/server/storefront-public'
import { CartButton } from './CartButton'
import { LanguageSwitch } from './LanguageSwitch'
import { useEntranceAnimation } from '~/lib/useScrollReveal'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { ShareSheet, type ShareTarget } from './ShareSheet'
import { buildAppLink, buildShareableAppUrl, buildMerchantTelegramLink, type TelegramLinkConfig } from '~/lib/telegram-links'
import { buildMerchantWhatsAppLink } from '~/lib/whatsapp-links'
import { PhoneIcon, PinIcon } from './Icons'

export function StorefrontHeader({
  store,
  isOwner,
  telegramConfig,
  fbAppId,
}: {
  store: PublicStore
  isOwner: boolean
  telegramConfig: TelegramLinkConfig | null
  fbAppId: string | null
}) {
  const bannerRef = useEntranceAnimation<HTMLDivElement>(
    { opacity: 0, y: -16 },
    { opacity: 1, y: 0, duration: 0.5 },
  )
  const { t, locale } = useLocale()
  const [isShareOpen, setIsShareOpen] = useState(false)

  const communeName = locale === 'ar' ? store.communeNameAr : store.communeNameFr
  const wilayaName = locale === 'ar' ? store.wilayaNameAr : store.wilayaNameFr
  const locationText = [communeName, wilayaName].filter(Boolean).join(', ')

  // Telegram share is only offered when the deploy actually has the
  // required config — see the build-time/runtime env var caveat in
  // src/lib/telegram-links.ts. Falls back to just the external share URL
  // (still works fine — that landing page redirects to Telegram itself
  // once config exists) rather than crashing this component.
  const appShareTarget: ShareTarget = {
    telegramUrl: telegramConfig ? buildAppLink(telegramConfig) : undefined,
    externalUrl: buildShareableAppUrl(typeof window !== 'undefined' ? window.location.origin : ''),
    title: t.appName,
    text: t.share.defaultShareText,
  }

  return (
    <header ref={bannerRef}>
      {store.bannerUrl && (
        <div className="h-32 sm:h-48 w-full overflow-hidden bg-[var(--color-surface-muted)]">
          <img src={store.bannerUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          {store.logoUrl && (
            <img
              src={store.logoUrl}
              alt={store.name}
              className="h-12 w-12 shrink-0 rounded-full object-cover border border-[var(--color-border)]"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-[var(--color-text-primary)] truncate">{store.name}</h1>
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--color-success)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-success)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                {t.activeShopBadge}
              </span>
            </div>
            {store.description && (
              <p className="text-xs text-[var(--color-text-muted)] truncate">{store.description}</p>
            )}
            {locationText && (
              <p className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] truncate">
                <PinIcon className="h-3 w-3 shrink-0" />
                {locationText}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <LanguageSwitch />
          <button
            onClick={() => setIsShareOpen(true)}
            aria-label={t.share.shareApp}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-primary)]"
          >
            ↗
          </button>
          <CartButton storeSlug={store.slug} />
        </div>
      </div>

      {(store.merchantTelegramUsername ||
        store.merchantWhatsappNumber ||
        store.merchantPhone ||
        store.googleMapsUrl ||
        isOwner) && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {store.merchantTelegramUsername && (
            <a
              href={buildMerchantTelegramLink(store.merchantTelegramUsername)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#229ED9] px-4 py-2 text-xs font-semibold text-white"
            >
              {t.visitMerchantTelegram}
            </a>
          )}
          {store.merchantWhatsappNumber && (
            <a
              href={buildMerchantWhatsAppLink(
                store.merchantWhatsappNumber,
                `${t.share.defaultShareText} — ${store.name}`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white"
            >
              {t.visitMerchantWhatsApp}
            </a>
          )}
          {store.merchantPhone && (
            <a
              href={`tel:${store.merchantPhone}`}
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              <PhoneIcon className="h-3.5 w-3.5" />
              {store.merchantPhone}
            </a>
          )}
          {store.googleMapsUrl && (
            <a
              href={store.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              <PinIcon className="h-3.5 w-3.5" />
              {t.viewOnMap}
            </a>
          )}
          {isOwner && (
            <Link
              to="/dashboard"
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              {t.manageMyStore}
            </Link>
          )}
        </div>
      )}

      <ShareSheet target={appShareTarget} isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} fbAppId={fbAppId} />
    </header>
  )
}




