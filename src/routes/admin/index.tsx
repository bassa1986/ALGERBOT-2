import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { getMarketplaceStats } from '~/server/admin'
import { logoutAdmin } from '~/server/admin-auth'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'

export const Route = createFileRoute('/admin/')({
  loader: async () => {
    const stats = await getMarketplaceStats()
    return { stats }
  },
  component: AdminHome,
})

function AdminHome() {
  const { stats } = Route.useLoaderData()
  const logout = useServerFn(logoutAdmin)
  const navigate = useNavigate()
  const { locale, t, dir } = useLocale()
  const a = t.admin

  async function handleLogout() {
    await logout()
    await navigate({ to: '/admin/login', search: { redirect: '/admin' } })
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          {a.adminDashboardTitle}
        </h1>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <button onClick={handleLogout} className="text-sm text-[var(--color-text-muted)] underline">
            {a.logout}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label={a.activeMerchants} value={stats.activeMerchants} />
        <StatCard label={a.pendingMerchants} value={stats.pendingMerchants} highlight={stats.pendingMerchants > 0} />
        <StatCard label={a.publishedStores} value={stats.publishedStores} />
        <StatCard label={a.productsCount} value={stats.totalProducts} />
        <StatCard label={a.ordersLast30} value={stats.ordersLast30Days} />
        <StatCard
          label={a.revenueLast30}
          value={formatDzd(stats.revenueLast30DaysCentimes, locale)}
        />
        <StatCard
          label={a.pendingProofs}
          value={stats.pendingBillingProofs}
          highlight={stats.pendingBillingProofs > 0}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <AdminNavCard to="/admin/merchants" label={a.merchants} />
        <AdminNavCard to="/admin/orders" label={a.ordersLabel} />
        <AdminNavCard to="/admin/billing" label={a.billing} />
        <AdminNavCard to="/admin/categories" label={a.categories} />
        <AdminNavCard to="/admin/settings" label={a.settingsLabel} />
      </div>
    </div>
  )
}

function StatCard({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm ${
        highlight ? 'bg-[var(--color-accent)]/20' : 'bg-[var(--color-surface)]'
      }`}
    >
      <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  )
}

function AdminNavCard({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm text-center font-semibold text-[var(--color-text-primary)]"
    >
      {label}
    </Link>
  )
}
