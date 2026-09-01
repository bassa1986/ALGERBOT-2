import { createFileRoute } from '@tanstack/react-router'
import { listActivePlans } from '~/lib/plans'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { SiteNav } from '~/components/storefront/SiteNav'
import { SiteFooter } from '~/components/storefront/SiteFooter'
import { PricingSection } from '~/components/storefront/PricingSection'

export const Route = createFileRoute('/pricing')({
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
  const { t, dir } = useLocale()
  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
      <header className="text-center pt-8 pb-2">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
      </header>
      <SiteNav />
      <PricingSection plans={plans} />
      <SiteFooter />
    </div>
  )
}
