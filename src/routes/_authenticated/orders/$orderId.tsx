import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { getMyOrder, advanceOrderChecklist, cancelMyOrder, type OrderItemRow } from '~/server/orders'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import type { OrderStatusLabels } from '~/lib/i18n/translations'

const STEP_SEQUENCE = ['confirmed', 'packed', 'handed_to_courier', 'delivered', 'paid'] as const

export const Route = createFileRoute('/_authenticated/orders/$orderId')({
  loader: async ({ params }) => {
    const order = await getMyOrder({ data: { orderId: params.orderId } })
    return { order }
  },
  component: OrderDetailPage,
})

function OrderDetailPage() {
  const { order } = Route.useLoaderData()
  const router = useRouter()
  const advance = useServerFn(advanceOrderChecklist)
  const cancel = useServerFn(cancelMyOrder)
  const { locale, t, dir } = useLocale()
  const m = t.merchant

  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const currentIndex = STEP_SEQUENCE.indexOf(order.status as (typeof STEP_SEQUENCE)[number])
  const nextStep = order.status !== 'cancelled' && currentIndex < STEP_SEQUENCE.length - 1
    ? STEP_SEQUENCE[currentIndex + 1]
    : null

  function statusLabel(step: string): string {
    return t.orderStatus[step as keyof OrderStatusLabels] ?? step
  }

  async function handleAdvance() {
    if (!nextStep) return
    setError(null)
    setIsBusy(true)
    try {
      await advance({ data: { orderId: order.id, step: nextStep } })
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la mise à jour')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      setError('Un motif est requis pour annuler')
      return
    }
    setError(null)
    setIsBusy(true)
    try {
      await cancel({ data: { orderId: order.id, reason: cancelReason.trim() } })
      setShowCancelForm(false)
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'annulation")
    } finally {
      setIsBusy(false)
    }
  }

  const canCancel = order.status !== 'cancelled' && order.status !== 'delivered' && order.status !== 'paid'

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4 space-y-4" dir={dir}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          {m.orderTrackingTitle} {order.trackingCode}
        </h1>
        <Link to="/orders" className="text-sm text-[var(--color-text-muted)] underline">
          {m.back}
        </Link>
      </div>

      {/* Checklist progress */}
      <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-3">{m.orderTrackingTitle}</h2>

        <div className="flex flex-wrap gap-2 mb-4">
          {STEP_SEQUENCE.map((step, i) => {
            const isDone = order.status !== 'cancelled' && i <= currentIndex
            return (
              <span
                key={step}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isDone
                    ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                    : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
                }`}
              >
                {statusLabel(step)}
              </span>
            )
          })}
          {order.status === 'cancelled' && (
            <span className="rounded-full bg-[var(--color-danger)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)]">
              {t.orderStatus.cancelled}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}

        <div className="flex gap-2">
          {nextStep && (
            <button
              onClick={handleAdvance}
              disabled={isBusy}
              className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {m.markAsStep} "{statusLabel(nextStep)}"
            </button>
          )}
          {canCancel && !showCancelForm && (
            <button
              onClick={() => setShowCancelForm(true)}
              className="rounded-full border border-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)]"
            >
              {m.cancelOrder}
            </button>
          )}
        </div>

        {showCancelForm && (
          <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3">
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              {m.cancelReason}
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={isBusy}
                className="rounded-full bg-[var(--color-danger)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {m.confirmCancellation}
              </button>
              <button
                onClick={() => setShowCancelForm(false)}
                className="text-sm text-[var(--color-text-muted)]"
              >
                {m.cancel}
              </button>
            </div>
          </div>
        )}

        {order.cancelReason && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">
            {m.notePrefix} : {order.cancelReason}
          </p>
        )}
      </section>

      {/* Buyer contact */}
      <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-2">{m.buyer}</h2>
        <p className="text-sm text-[var(--color-text-primary)]">{order.buyerName}</p>
        <p className="text-sm text-[var(--color-text-primary)]">{order.buyerPhone}</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          {order.buyerAddress}, {order.buyerCommune}
        </p>
        {order.buyerNotes && (
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{order.buyerNotes}</p>
        )}
      </section>

      {/* Line items */}
      <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-2">{m.items}</h2>
        <div className="space-y-1">
          {order.items.map((item: OrderItemRow) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-[var(--color-text-primary)]">
                {item.productNameSnapshot}
                {item.variantLabelSnapshot ? ` (${item.variantLabelSnapshot})` : ''} × {item.quantity}
              </span>
              <span className="text-[var(--color-text-muted)]">
                {formatDzd(item.lineTotalCentimes, locale)}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--color-border)] mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-[var(--color-text-muted)]">
            <span>{m.subTotalLabel}</span>
            <span>{formatDzd(order.subtotalCentimes, locale)}</span>
          </div>
          <div className="flex justify-between text-[var(--color-text-muted)]">
            <span>{m.deliveryLabel}</span>
            <span>{formatDzd(order.deliveryFeeCentimes, locale)}</span>
          </div>
          <div className="flex justify-between font-semibold text-[var(--color-text-primary)]">
            <span>{m.totalLabel}</span>
            <span>{formatDzd(order.totalCentimes, locale)}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
