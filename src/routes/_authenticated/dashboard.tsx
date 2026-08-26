import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { getMyStore } from '~/server/store'
import { logoutMerchant } from '~/server/auth'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'

// If the merchant has no store yet, send them to onboarding instead of an
// empty dashboard — a store is created once, in one step, before anything
// else in the dashboard makes sense.
export const Route = createFileRoute('/_authenticated/dashboard')({
  loader: async () => {
    const store = await getMyStore()
    if (!store) {
      throw redirect({ to: '/onboarding' })
    }
    return { store }
  },
  component: MerchantDashboard,
})

function MerchantDashboard() {
  const { store } = Route.useLoaderData()
  const navigate = useNavigate()
  const logout = useServerFn(logoutMerchant)
  const { t, dir } = useLocale()
  const m = t.merchant

  async function handleLogout() {
    await logout()
    await navigate({ to: '/login', search: { redirect: '/dashboard' } })
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          {store.name}
        </h1>

        <div className="flex items-center gap-2 flex-wrap">
          <LanguageSwitch />

          <Link
            to="/billing"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {m.subscription}
          </Link>

          <Link
            to="/inventory"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {m.inventory}
          </Link>

          <Link
            to="/orders"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {m.orders}
          </Link>

          <Link
            to="/products"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {m.products}
          </Link>

          <Link
            to="/store-settings"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {m.settings}
          </Link>

          <Link
            to="/s/$slug"
            params={{ slug: store.slug }}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm active:scale-95 transition-transform"
          >
            {m.viewMyStore}
          </Link>

          <button
            onClick={handleLogout}
            className="text-sm text-[var(--color-text-muted)] underline px-2"
          >
            {m.logout}
          </button>
        </div>
      </header>

      {!store.isPublished && (
        <p className="mb-4 rounded-lg bg-[var(--color-accent)]/20 px-3 py-2 text-sm text-[var(--color-text-primary)]">
          {m.notPublishedWarning}
        </p>
      )}

      {/* Products, orders, inventory, and subscription cards are added in
          their respective steps (4, 6, 7, 9). */}
    </div>
  )
}
