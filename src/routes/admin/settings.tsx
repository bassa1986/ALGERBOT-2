import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { getSubscriptionSettings, updateSubscriptionSettings } from '~/server/admin'
import { useLocale } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/admin/settings')({
  loader: async () => {
    const settings = await getSubscriptionSettings()
    return { settings }
  },
  component: AdminSettingsPage,
})

function AdminSettingsPage() {
  const { settings } = Route.useLoaderData()
  const update = useServerFn(updateSubscriptionSettings)
  const { t, dir } = useLocale()
  const a = t.admin

  const [priceDzd, setPriceDzd] = useState(((settings?.monthlyPriceCentimes ?? 0) / 100).toFixed(2))
  const [trialDays, setTrialDays] = useState(String(settings?.freeTrialDays ?? 15))
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    setSaved(false)
    const monthlyPriceCentimes = Math.round(parseFloat(priceDzd) * 100)
    const freeTrialDays = parseInt(trialDays, 10)
    if (Number.isNaN(monthlyPriceCentimes) || Number.isNaN(freeTrialDays)) {
      setError('Valeurs invalides')
      return
    }
    setIsSaving(true)
    try {
      await update({ data: { monthlyPriceCentimes, freeTrialDays } })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{a.settingsTitle}</h1>
        <Link to="/admin" className="text-sm text-[var(--color-text-muted)]">
          {a.dashboard}
        </Link>
      </div>

      <div className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-md">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-3">{a.subscriptionSettings}</h2>

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {a.monthlyPriceDzd}
        </label>
        <input
          type="number"
          step={0.01}
          value={priceDzd}
          onChange={(e) => setPriceDzd(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {a.freeTrialDays}
        </label>
        <input
          type="number"
          min={0}
          value={trialDays}
          onChange={(e) => setTrialDays(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}
        {saved && <p className="text-sm text-[var(--color-success)] mb-3">✓</p>}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? '...' : a.saveLabel}
        </button>
      </div>
    </div>
  )
}


