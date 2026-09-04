import { createFileRoute } from '@tanstack/react-router'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { SiteNav } from '~/components/storefront/SiteNav'
import { SiteFooter } from '~/components/storefront/SiteFooter'

export const Route = createFileRoute('/privacy')({
  component: () => (
    <LocaleProvider>
      <PrivacyPage />
    </LocaleProvider>
  ),
})

function PrivacyPage() {
  const { t, dir } = useLocale()
  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
      <header className="text-center pt-8 pb-2">
        <h1 className="app-title text-2xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
      </header>
      <SiteNav />
      <section className="px-4 pb-8">
        <div className="mx-auto max-w-lg rounded-2xl bg-[var(--color-surface)] shadow-sm p-6">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-3">
            {t.privacyTitle}
          </h2>
          <p className="text-sm text-[var(--color-text-primary)] leading-relaxed">
            {t.privacyBody}
          </p>
        </div>
      </section>
      <SiteFooter />
    </div>
  )
}
