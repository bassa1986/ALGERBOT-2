import { createFileRoute, Link } from '@tanstack/react-router'
import { listActivePlans } from '~/lib/plans'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { SiteNav } from '~/components/storefront/SiteNav'
import { SiteFooter } from '~/components/storefront/SiteFooter'
import { PricingSection } from '~/components/storefront/PricingSection'

// A relative `next` path means this page is a step in the post-signup
// flow (see src/routes/login.tsx): a brand-new merchant lands here right
// after their first login, then continues on to their real destination
// (normally /dashboard). Visiting /pricing directly from the public nav
// has no `next`, so the continue banner below doesn't render — same
// plain marketing page as before.
function sanitizeNext(url: unknown): string | undefined {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return undefined
  return url
}

export const Route = createFileRoute('/pricing')({
  validateSearch: (search: Record<string, unknown>) => ({
    next: sanitizeNext(search.next),
  }),
  loader: async () => {
    const plans = await listActivePlans()
    return { plans }
  },
  component: () => (
    <LocaleProvider>
      <PricingPage />
    </LocaleProvider>
  ),
})

function PricingPage() {
  const { plans } = Route.useLoaderData()
  const { next } = Route.useSearch()
  const { t, dir } = useLocale()
  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
      <header className="text-center pt-8 pb-2">
        <h1 className="app-title text-2xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
      </header>
      <SiteNav />
      {next && (
        <div className="mx-auto mb-2 max-w-sm px-4 text-center">
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t.pricingContinueHint}</p>
          <Link
            to={next}
            className="inline-block rounded-full bg-[var(--color-action-primary)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            {t.pricingContinueButton}
          </Link>
        </div>
      )}
      <PricingSection plans={plans} />
      <SiteFooter />
    </div>
  )
}
