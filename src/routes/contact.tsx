import { createFileRoute } from '@tanstack/react-router'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { SiteNav } from '~/components/storefront/SiteNav'
import { SiteFooter } from '~/components/storefront/SiteFooter'

const SUPPORT_EMAIL = 'saasgcc8@gmail.com'

export const Route = createFileRoute('/contact')({
  component: () => (
    <LocaleProvider>
      <ContactPage />
    </LocaleProvider>
  ),
})

function ContactPage() {
  const { t, dir } = useLocale()
  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
      <header className="text-center pt-8 pb-2">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
      </header>
      <SiteNav />
      <section className="px-4 pb-8">
        <div className="mx-auto max-w-lg rounded-2xl bg-[var(--color-surface)] shadow-sm p-6 text-center">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-3">
            {t.contactTitle}
          </h2>
          <p className="text-sm text-[var(--color-text-primary)] leading-relaxed mb-5">
            {t.contactBody}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mb-1">{t.contactEmailLabel}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-block rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </section>
      <SiteFooter />
    </div>
  )
}
