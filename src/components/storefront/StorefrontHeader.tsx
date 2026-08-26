import { useState } from 'react'
import type { PublicStore } from '~/server/storefront-public'
import { CartButton } from './CartButton'
import { LanguageSwitch } from './LanguageSwitch'
import { useEntranceAnimation } from '~/lib/useScrollReveal'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { ShareSheet, type ShareTarget } from './ShareSheet'
import { buildAppLink, buildShareableAppUrl } from '~/lib/telegram-links'

export function StorefrontHeader({ store }: { store: PublicStore }) {
  const bannerRef = useEntranceAnimation<HTMLDivElement>(
    { opacity: 0, y: -16 },
    { opacity: 1, y: 0, duration: 0.5 },
  )
  const { t } = useLocale()
  const [isShareOpen, setIsShareOpen] = useState(false)

  const appShareTarget: ShareTarget = {
    telegramUrl: buildAppLink(),
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
            <h1 className="font-bold text-[var(--color-text-primary)] truncate">{store.name}</h1>
            {store.description && (
              <p className="text-xs text-[var(--color-text-muted)] truncate">{store.description}</p>
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

      <ShareSheet target={appShareTarget} isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />
    </header>
  )
}
