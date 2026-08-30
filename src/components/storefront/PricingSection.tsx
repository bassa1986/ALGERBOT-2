import { Link } from '@tanstack/react-router'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import type { PublicPricingInfo } from '~/server/billing'

export function PricingSection({ pricing }: Readonly<{ pricing: PublicPricingInfo }>) {
  const { t, locale } = useLocale()
  return (
    <section className="px-4 pb-8">
      <div className="mx-auto max-w-sm rounded-2xl bg-[var(--color-surface)] shadow-sm p-6 text-center">
        <span className="inline-block rounded-full bg-[var(--color-action-primary)]/10 text-[var(--color-action-primary)] text-xs font-semibold px-3 py-1 mb-3">
          {t.pricingTrialBadge}
        </span>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">
          {t.pricingTitle}
        </h2>
        <p className="text-3xl font-extrabold text-[var(--color-action-primary)] mb-1">
          {formatDzd(pricing.monthlyPriceCentimes, locale)}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mb-5">{t.pricingPricePeriod}</p>
        <ul className="text-sm text-[var(--color-text-primary)] text-start space-y-2 mb-6">
          <li>{t.pricingFeature1}</li>
          <li>{t.pricingFeature2}</li>
          <li>{t.pricingFeature3}</li>
          <li>{t.pricingFeature4}</li>
        </ul>
        <Link
          to="/login"
          className="inline-block w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white"
        >
          {t.pricingCta}
        </Link>
      </div>
    </section>
  )
}
