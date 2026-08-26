import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { z } from 'zod'
import { listMerchants, setMerchantStatus, type AdminMerchantRow } from '~/server/admin'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDate } from '~/lib/i18n/format'

const STATUS_VALUES = ['pending', 'active', 'suspended'] as const
type StatusValue = (typeof STATUS_VALUES)[number]
function isStatusValue(v: string | undefined): v is StatusValue {
  return v !== undefined && (STATUS_VALUES as readonly string[]).includes(v)
}

const searchSchema = z.object({ status: z.string().optional(), q: z.string().optional() })

export const Route = createFileRoute('/admin/merchants')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status, q: search.q }),
  loader: async ({ deps }) => {
    const merchants = await listMerchants({
      data: { status: isStatusValue(deps.status) ? deps.status : undefined, search: deps.q },
    })
    return { merchants }
  },
  component: MerchantsPage,
})

function MerchantsPage() {
  const { merchants } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const setStatus = useServerFn(setMerchantStatus)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { locale, t, dir } = useLocale()
  const a = t.admin

  const MERCHANT_STATUS_LABELS: Record<string, string> = {
    pending: locale === 'ar' ? 'في الانتظار' : 'En attente',
    active: locale === 'ar' ? 'نشط' : 'Actif',
    suspended: locale === 'ar' ? 'معلق' : 'Suspendu',
  }

  async function handleSetStatus(merchantId: string, status: StatusValue) {
    setBusyId(merchantId)
    try {
      await setStatus({ data: { merchantId, status } })
      await router.invalidate({ sync: true })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{a.merchants}</h1>
        <Link to="/admin" className="text-sm text-[var(--color-text-muted)]">
          {a.dashboard}
        </Link>
      </div>

      <div className="flex gap-2 mb-3">
        {(['', 'pending', 'active', 'suspended'] as const).map((s) => (
          <button
            key={s}
            onClick={() => navigate({ search: { ...search, status: s || undefined } })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              (search.status ?? '') === s
                ? 'bg-[var(--color-action-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
            }`}
          >
            {s ? MERCHANT_STATUS_LABELS[s] : a.allMerchants}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder={locale === 'ar' ? 'بحث...' : 'Rechercher...'}
        defaultValue={search.q ?? ''}
        onChange={(e) => navigate({ search: { ...search, q: e.target.value || undefined } })}
        className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4 text-sm"
      />

      <div className="space-y-2">
        {merchants.map((m: AdminMerchantRow) => (
          <div key={m.id} className="rounded-xl bg-[var(--color-surface)] p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-primary)] truncate">
                  {m.storeName ?? m.fullName ?? m.telegramUsername ?? '—'}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  @{m.telegramUsername ?? '—'}
                  {m.subscriptionExpiresAt &&
                    ` · ${formatDate(m.subscriptionExpiresAt, locale)}`}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--color-accent)]/20 px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
                {MERCHANT_STATUS_LABELS[m.status]}
              </span>
            </div>

            <div className="flex gap-2 mt-2">
              {m.status !== 'active' && (
                <button
                  onClick={() => handleSetStatus(m.id, 'active')}
                  disabled={busyId === m.id}
                  className="rounded-full bg-[var(--color-success)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {a.approve}
                </button>
              )}
              {m.status !== 'suspended' && (
                <button
                  onClick={() => handleSetStatus(m.id, 'suspended')}
                  disabled={busyId === m.id}
                  className="rounded-full bg-[var(--color-danger)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {a.suspend}
                </button>
              )}
              {m.storeSlug && (
                <a
                  href={`/s/${m.storeSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs"
                >
                  {a.viewStore}
                </a>
              )}
            </div>
          </div>
        ))}
        {merchants.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{a.noMerchants}</p>
        )}
      </div>
    </div>
  )
}
