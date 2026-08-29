import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { z } from 'zod'
import { listMyOrders, type OrderListItem } from '~/server/orders'
import { exportMyOrders } from '~/server/export'
import { downloadBase64File } from '~/lib/upload'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import type { OrderStatusLabels } from '~/lib/i18n/translations'

const ORDER_STATUS_VALUES = [
  'confirmed',
  'packed',
  'handed_to_courier',
  'delivered',
  'paid',
  'cancelled',
] as const
type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number]

function isOrderStatus(value: string | undefined): value is OrderStatusValue {
  return value !== undefined && (ORDER_STATUS_VALUES as readonly string[]).includes(value)
}

const searchSchema = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/orders/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status, q: search.q }),
  loader: async ({ deps }) => {
    const orders = await listMyOrders({
      data: {
        status: isOrderStatus(deps.status) ? deps.status : undefined,
        search: deps.q,
      },
    })
    return { orders }
  },
  component: OrdersListPage,
})

function OrdersListPage() {
  const { orders } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const exportOrders = useServerFn(exportMyOrders)
  const [isExporting, setIsExporting] = useState(false)
  const { locale, t, dir } = useLocale()
  const m = t.merchant

  const STATUS_FILTERS = [
    { value: '', label: m.allStatuses },
    { value: 'confirmed', label: t.orderStatus.confirmed },
    { value: 'packed', label: t.orderStatus.packed },
    { value: 'handed_to_courier', label: t.orderStatus.handed_to_courier },
    { value: 'delivered', label: t.orderStatus.delivered },
    { value: 'paid', label: t.orderStatus.paid },
    { value: 'cancelled', label: t.orderStatus.cancelled },
  ] as const

  async function handleExport() {
    setIsExporting(true)
    try {
      const status = isOrderStatus(search.status) ? search.status : undefined
      const { base64, filename } = await exportOrders({ data: { status, search: search.q } })
      downloadBase64File(base64, filename)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{m.ordersTitle}</h1>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] disabled:opacity-50"
        >
          {isExporting ? m.exporting : m.exportExcel}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => navigate({ search: { ...search, status: f.value || undefined } })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              (search.status ?? '') === f.value
                ? 'bg-[var(--color-action-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder={m.searchOrderPlaceholder}
        defaultValue={search.q ?? ''}
        onChange={(e) => {
          const q = e.target.value
          navigate({ search: { ...search, q: q || undefined } })
        }}
        className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4 text-sm"
      />

      <div className="space-y-2">
        {orders.map((order: OrderListItem) => (
          <Link
            key={order.id}
            to="/orders/$orderId"
            params={{ orderId: order.id }}
            className="block rounded-xl bg-[var(--color-surface)] p-3 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">
                  {order.trackingCode} · {order.buyerName}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {order.buyerPhone} · {formatDzd(order.totalCentimes, locale)}
                </p>
              </div>
              <span className="rounded-full bg-[var(--color-accent)]/20 px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
                {t.orderStatus[order.status as keyof OrderStatusLabels] ?? order.status}
              </span>
            </div>
          </Link>
        ))}
        {orders.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{m.noOrders}</p>
        )}
      </div>
    </div>
  )
}


