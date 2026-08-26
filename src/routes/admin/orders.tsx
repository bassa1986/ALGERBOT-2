import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { listAllOrders, type AdminOrderRow } from '~/server/admin'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import type { OrderStatusLabels } from '~/lib/i18n/translations'

const ORDER_STATUS_VALUES = ['confirmed', 'packed', 'handed_to_courier', 'delivered', 'paid', 'cancelled'] as const
type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number]
function isOrderStatus(v: string | undefined): v is OrderStatusValue {
  return v !== undefined && (ORDER_STATUS_VALUES as readonly string[]).includes(v)
}

const searchSchema = z.object({ status: z.string().optional(), q: z.string().optional() })

export const Route = createFileRoute('/admin/orders')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status, q: search.q }),
  loader: async ({ deps }) => {
    const orders = await listAllOrders({
      data: { status: isOrderStatus(deps.status) ? deps.status : undefined, search: deps.q },
    })
    return { orders }
  },
  component: AdminOrdersPage,
})

function AdminOrdersPage() {
  const { orders } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { locale, t, dir } = useLocale()
  const a = t.admin
  const m = t.merchant

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{a.allOrders}</h1>
        <Link to="/admin" className="text-sm text-[var(--color-text-muted)]">
          {a.dashboard}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(['', ...ORDER_STATUS_VALUES] as const).map((s) => (
          <button
            key={s}
            onClick={() => navigate({ search: { ...search, status: s || undefined } })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              (search.status ?? '') === s
                ? 'bg-[var(--color-action-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
            }`}
          >
            {s ? t.orderStatus[s as keyof OrderStatusLabels] : m.allStatuses}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder={m.searchOrderPlaceholder}
        defaultValue={search.q ?? ''}
        onChange={(e) => navigate({ search: { ...search, q: e.target.value || undefined } })}
        className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4 text-sm"
      />

      <div className="space-y-2">
        {orders.map((o: AdminOrderRow) => (
          <div key={o.id} className="rounded-xl bg-[var(--color-surface)] p-3 shadow-sm flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-medium text-[var(--color-text-primary)] truncate">
                {o.trackingCode} · {o.storeName}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {o.buyerName} · {o.buyerPhone} · {formatDzd(o.totalCentimes, locale)}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--color-accent)]/20 px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
              {t.orderStatus[o.status as keyof OrderStatusLabels] ?? o.status}
            </span>
          </div>
        ))}
        {orders.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">{m.noOrders}</p>}
      </div>
    </div>
  )
}
