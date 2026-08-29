import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { getMyStore, createMyStore } from '~/server/store'
import { useLocale } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/_authenticated/onboarding')({
  loader: async () => {
    // If the merchant already has a store, onboarding is done — send them
    // straight to the dashboard instead of letting them create a second one.
    const store = await getMyStore()
    if (store) {
      throw redirect({ to: '/dashboard' })
    }
    return null
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const createStore = useServerFn(createMyStore)
  const { t, dir } = useLocale()
  const m = t.merchant
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await createStore({ data: { name, description: description || undefined } })
      await navigate({ to: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4 flex items-center justify-center" dir={dir}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-1">
          {m.onboardingTitle}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-5">
          {m.onboardingSubtitle}
        </p>

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {m.storeName}
        </label>
        <input
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
          placeholder={m.storeNamePlaceholder}
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {m.descriptionOptional}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        {error && (
          <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || name.trim().length < 2}
          className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? m.creating : m.createMyStore}
        </button>
      </form>
    </div>
  )
}


