import { createFileRoute, Link, getRouteApi } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { useCart } from '~/components/storefront/CartContext'
import { submitCheckout } from '~/server/checkout'
import { getWilayas, type WilayaRow } from '~/server/wilayas'
import { useTelegramMainButton, notifyTelegramResult } from '~/lib/useTelegramMainButton'
import { useIsInsideTelegram } from '~/lib/useTelegramWebApp'
import { getTelegramBuyerDisplayName } from '~/lib/useDeepLinkRouting'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'

const parentRoute = getRouteApi('/s/$slug')

export const Route = createFileRoute('/s/$slug/checkout')({
  loader: async () => {
    const wilayas = await getWilayas()
    return { wilayas }
  },
  component: CheckoutPage,
})

interface ConfirmationState {
  trackingCode: string
  totalCentimes: number
}

function CheckoutPage() {
  const { store } = parentRoute.useLoaderData()
  const { wilayas } = Route.useLoaderData()
  const params = Route.useParams()
  const cart = useCart()
  const checkout = useServerFn(submitCheckout)
  const { locale, t } = useLocale()
  const isInTelegram = useIsInsideTelegram()

  // Lazy initializer: reads Telegram's user.first_name/last_name once, on
  // first render, purely as a convenience prefill — the buyer can freely
  // edit or clear this. No account or session is created from it.
  const [buyerName, setBuyerName] = useState(() => getTelegramBuyerDisplayName() ?? '')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [wilayaCode, setWilayaCode] = useState<number | ''>('')
  const [buyerCommune, setBuyerCommune] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [buyerNotes, setBuyerNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null)

  async function performCheckout() {
    setError(null)

    if (wilayaCode === '') {
      setError(locale === 'ar' ? 'يرجى اختيار الولاية' : 'Veuillez sélectionner une wilaya')
      return
    }
    if (cart.lines.length === 0) {
      setError(t.cartEmpty)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await checkout({
        data: {
          storeSlug: store.slug,
          items: cart.lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
          })),
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerWilayaCode: wilayaCode,
          buyerCommune: buyerCommune.trim(),
          buyerAddress: buyerAddress.trim(),
          buyerNotes: buyerNotes.trim() || undefined,
        },
      })
      cart.clear()
      notifyTelegramResult('success')
      setConfirmation({ trackingCode: result.trackingCode, totalCentimes: result.totalCentimes })
    } catch (err) {
      notifyTelegramResult('error')
      setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الطلب' : 'Échec de la commande'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await performCheckout()
  }

  useTelegramMainButton({
    text: `${t.addWithPrice} ${formatDzd(cart.subtotalCentimes, locale)}`,
    onClick: performCheckout,
    enabled: confirmation === null && cart.lines.length > 0,
    isLoading: isSubmitting,
  })

  if (confirmation) {
    return (
      <div className="p-4 flex flex-col items-center text-center min-h-screen justify-center">
        <div className="rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm max-w-sm w-full">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            {t.orderConfirmed}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">{t.codPayment}</p>
          <div className="rounded-lg bg-[var(--color-surface-muted)] p-4 mb-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t.trackingCode}</p>
            <p className="text-2xl font-mono font-bold text-[var(--color-action-primary)]">
              {confirmation.trackingCode}
            </p>
          </div>
          <p className="font-semibold text-[var(--color-text-primary)] mb-6">
            {t.total} : {formatDzd(confirmation.totalCentimes, locale)}
          </p>
          <Link
            to="/s/$slug"
            params={{ slug: params.slug }}
            className="block rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white"
          >
            {t.backToStore}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{t.delivery}</h1>
        <Link to="/s/$slug/cart" params={{ slug: params.slug }} className="text-sm text-[var(--color-text-muted)]">
          {t.backToCart}
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-md">
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t.fullName}</label>
        <input
          type="text"
          required
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t.phone}</label>
        <input
          type="tel"
          required
          value={buyerPhone}
          onChange={(e) => setBuyerPhone(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t.wilaya}</label>
        <select
          required
          value={wilayaCode}
          onChange={(e) => setWilayaCode(e.target.value ? Number(e.target.value) : '')}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
        >
          <option value="">{t.selectWilaya}</option>
          {wilayas.map((w: WilayaRow) => (
            <option key={w.code} value={w.code}>
              {w.code.toString().padStart(2, '0')} — {locale === 'ar' ? w.nameAr : w.nameFr}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t.commune}</label>
        <input
          type="text"
          required
          value={buyerCommune}
          onChange={(e) => setBuyerCommune(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{t.address}</label>
        <textarea
          required
          value={buyerAddress}
          onChange={(e) => setBuyerAddress(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {t.notesOptional}
        </label>
        <textarea
          value={buyerNotes}
          onChange={(e) => setBuyerNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        <div className="border-t border-[var(--color-border)] pt-3 mb-4">
          <div className="flex justify-between text-sm text-[var(--color-text-muted)]">
            <span>{t.subtotal}</span>
            <span>{formatDzd(cart.subtotalCentimes, locale)}</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{t.deliveryFeeNote}</p>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}

        {!isInTelegram && (
          <button
            type="submit"
            disabled={isSubmitting || cart.lines.length === 0}
            className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {isSubmitting ? t.sending : t.confirmOrder}
          </button>
        )}
      </form>
    </div>
  )
}


