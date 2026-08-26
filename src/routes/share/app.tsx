import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { buildAppLink } from '~/lib/telegram-links'
import { useLocale, LocaleProvider } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/share/app')({
  head: () => ({
    meta: [
      { title: 'AlgerBot' },
      { name: 'description', content: 'La marketplace des commerçants algériens' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'AlgerBot' },
      { property: 'og:description', content: 'La marketplace des commerçants algériens' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'AlgerBot' },
    ],
  }),
  component: () => (
    <LocaleProvider>
      <ShareAppLandingPage />
    </LocaleProvider>
  ),
})

function ShareAppLandingPage() {
  const { t, dir } = useLocale()

  useEffect(() => {
    window.location.href = buildAppLink()
  }, [])

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">{t.share.landingIntro}</p>

        <a
          href={buildAppLink()}
          className="mb-2 block rounded-full bg-[var(--color-action-primary)] px-4 py-3 text-sm font-semibold text-white"
        >
          {t.share.openInTelegram}
        </a>

        <a
          href="https://telegram.org/dl"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-[var(--color-text-muted)] underline"
        >
          {t.share.getTelegram}
        </a>
      </div>
    </div>
  )
}
