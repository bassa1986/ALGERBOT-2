import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { buildAppLink } from '~/lib/telegram-links'
import { getTelegramLinkConfig } from '~/server/auth'
import { useLocale, LocaleProvider } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/share/app')({
  loader: async () => {
    const telegramConfig = await getTelegramLinkConfig()
    return { telegramConfig }
  },
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
  const { telegramConfig } = Route.useLoaderData()
  const { t, dir } = useLocale()
  const telegramUrl = telegramConfig ? buildAppLink(telegramConfig) : null

  useEffect(() => {
    if (telegramUrl) window.location.href = telegramUrl
  }, [telegramUrl])

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
        <h1 className="app-title mb-2 text-xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">{t.share.landingIntro}</p>

        {telegramUrl ? (
          <a
            href={telegramUrl}
            className="mb-2 block rounded-full bg-[var(--color-action-primary)] px-4 py-3 text-sm font-semibold text-white"
          >
            {t.share.openInTelegram}
          </a>
        ) : (
          // Config genuinely missing (TELEGRAM_BOT_USERNAME /
          // TELEGRAM_MINIAPP_SHORT_NAME not set on this deployment) —
          // shown instead of crashing the page or silently doing nothing.
          <p className="mb-2 text-xs text-[var(--color-danger)]">
            Configuration manquante : impossible de générer le lien Telegram.
          </p>
        )}

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
