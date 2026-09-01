import { Link } from '@tanstack/react-router'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import type { PlanLimits } from '~/lib/plans'

export function PricingSection({ plans }: Readonly<{ plans: PlanLimits[] }>) {
  const { locale } = useLocale()

  const L = locale === 'ar'
    ? {
        trialBadge: (days: number) => `🎉 ${days} يوم مجانًا`,
        pricePeriod: 'شهريًا',
        productsUnlimited: 'منتجات غير محدودة',
        productsMax: (n: number) => `حتى ${n} منتج`,
        storageLimit: (gb: string) => `${gb} GB تخزين`,
        imagesPerProduct: (n: number) => `${n} صور لكل منتج`,
        botFeature: 'متجر عبر بوت تيليجرام 🚀',
        dashboardFeature: 'تتبع الطلبات ولوحة تحكم كاملة 📦',
        noCommitment: 'بدون التزام، ألغِ في أي وقت 🎁',
        cta: 'ابدأ الآن',
        mostPopular: 'الأكثر طلبًا',
      }
    : {
        trialBadge: (days: number) => `🎉 ${days} jours gratuits`,
        pricePeriod: 'par mois',
        productsUnlimited: 'Produits illimités',
        productsMax: (n: number) => `Jusqu'à ${n} produits`,
        storageLimit: (gb: string) => `${gb} Go de stockage`,
        imagesPerProduct: (n: number) => `${n} photos par produit`,
        botFeature: 'Boutique via bot Telegram 🚀',
        dashboardFeature: 'Suivi des commandes et tableau de bord complet 📦',
        noCommitment: 'Sans engagement, annulez à tout moment 🎁',
        cta: 'Commencer',
        mostPopular: 'Le plus populaire',
      }

  // The middle plan (by sort order) is visually highlighted as the
  // recommended tier — a common pricing-page convention. With exactly 3
  // plans this is simply the 2nd one; falls back gracefully with fewer/more.
  const highlightIndex = plans.length >= 3 ? 1 : -1

  return (
    <section className="px-4 pb-8">
      <div className="mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
        {plans.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} highlighted={i === highlightIndex} L={L} />
        ))}
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  highlighted,
  L,
}: {
  plan: PlanLimits
  highlighted: boolean
  L: {
    trialBadge: (days: number) => string
    pricePeriod: string
    productsUnlimited: string
    productsMax: (n: number) => string
    storageLimit: (gb: string) => string
    imagesPerProduct: (n: number) => string
    botFeature: string
    dashboardFeature: string
    noCommitment: string
    cta: string
    mostPopular: string
  }
}) {
  const { locale } = useLocale()

  return (
    <div
      className={`rounded-2xl bg-[var(--color-surface)] shadow-sm p-6 text-center flex flex-col ${
        highlighted ? 'ring-2 ring-[var(--color-action-primary)] sm:-translate-y-2' : ''
      }`}
    >
      {highlighted && (
        <span className="inline-block self-center rounded-full bg-[var(--color-action-primary)] text-white text-xs font-semibold px-3 py-1 mb-2">
          {L.mostPopular}
        </span>
      )}
      {plan.trialDays > 0 && (
        <span className="inline-block self-center rounded-full bg-[var(--color-action-primary)]/10 text-[var(--color-action-primary)] text-xs font-semibold px-3 py-1 mb-3">
          {L.trialBadge(plan.trialDays)}
        </span>
      )}

      <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-1">{plan.name}</h2>
      <p className="text-3xl font-extrabold text-[var(--color-action-primary)] mb-1">
        {formatDzd(plan.monthlyPriceCentimes, locale)}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mb-5">{L.pricePeriod}</p>

      <ul className="text-sm text-[var(--color-text-primary)] text-start space-y-2 mb-6 flex-1">
        <li>{plan.maxProducts === null ? L.productsUnlimited : L.productsMax(plan.maxProducts)}</li>
        <li>{L.imagesPerProduct(plan.maxImagesPerProduct)}</li>
        {plan.storageLimitBytes !== null && (
          <li>{L.storageLimit((plan.storageLimitBytes / 1_073_741_824).toFixed(0))}</li>
        )}
        <li>{L.botFeature}</li>
        <li>{L.dashboardFeature}</li>
        <li>{L.noCommitment}</li>
      </ul>

      <Link
        to="/login"
        search={{ redirect: '/dashboard' }}
        className={`inline-block w-full rounded-full px-4 py-2.5 font-semibold ${
          highlighted
            ? 'bg-[var(--color-action-primary)] text-white'
            : 'border border-[var(--color-action-primary)] text-[var(--color-action-primary)]'
        }`}
      >
        {L.cta}
      </Link>
    </div>
  )
}
