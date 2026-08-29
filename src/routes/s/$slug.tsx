import { createFileRoute, Outlet, notFound } from '@tanstack/react-router'
import { getPublicStoreBySlug } from '~/server/storefront-public'
import { CartProvider } from '~/components/storefront/CartContext'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/s/$slug')({
  loader: async ({ params }) => {
    const store = await getPublicStoreBySlug({ data: { slug: params.slug } })
    if (!store) throw notFound()
    return { store }
  },
  component: () => (
    <LocaleProvider>
      <StorefrontLayout />
    </LocaleProvider>
  ),
})

function StorefrontLayout() {
  const { dir } = useLocale()
  return (
    <CartProvider>
      <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
        <Outlet />
      </div>
    </CartProvider>
  )
}


