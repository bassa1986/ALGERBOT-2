import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { lookupOrder, type LookupOrderResult } from '~/server/checkout'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd, formatDate } from '~/lib/i18n/format'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'
import type { OrderStatusLabels } from '~/lib/i18n/translations'

export const Route = createFileRoute('/order-lookup')({
  component: () => (
    <LocaleProvider>
      <OrderLookupPage />
    </LocaleProvider>
  ),
})

function OrderLookupPage() {
  const lookup = useServerFn(lookupOrder)
  const { locale, t, dir } = useLocale()
  const [trackingCode, setTrackingCode] = useState('')
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<LookupOrderResult | null | undefined>(undefined)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSearching(true)
    try {
      const found = await lookup({ data: { trackingCode: trackingCode.trim(), phone: phone.trim() } })
      setResult(found)
    } catch (err) {
      setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشل البحث' : 'Échec de la recherche'))
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{t.trackOrder}</h1>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <Link to="/" className="text-sm text-[var(--color-text-muted)]">
            {t.home}
          </Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-md">
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {t.trackingCodeLabel}
        </label>
        <input
          type="text"
          required
          value={trackingCode}
          onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
          placeholder="Ex : AB482913"
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4 uppercase"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {t.phoneUsedAtOrder}
        </label>
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}

        <button
          type="submit"
          disabled={isSearching}
          className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {isSearching ? t.searching : t.search}
        </button>
      </form>

      {result === null && (
        <p className="mt-4 text-sm text-[var(--color-danger)]">{t.noOrderFound}</p>
      )}

      {result && (
        <div className="mt-4 rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-md">
          <h2 className="font-semibold text-[var(--color-text-primary)] mb-1">
            {result.trackingCode} — {result.storeName}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            {formatDate(result.createdAt, locale)} · {formatDzd(result.totalCentimes, locale)}
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {result.events.map((event, i) => (
              <span
                key={i}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  event.step === 'cancelled'
                    ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
                    : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                }`}
              >
                {t.orderStatus[event.step as keyof OrderStatusLabels] ?? event.step}
              </span>
            ))}
          </div>

          <div className="space-y-1 border-t border-[var(--color-border)] pt-3">
            {result.items.map((item, i) => (
              <p key={i} className="text-sm text-[var(--color-text-primary)]">
                {item.productNameSnapshot}
                {item.variantLabelSnapshot ? ` (${item.variantLabelSnapshot})` : ''} × {item.quantity}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


