import { createFileRoute, Outlet, notFound } from '@tanstack/react-router'
import { getPublicStoreBySlug } from '~/server/storefront-public'
import { getCurrentMerchantId } from '~/server/store'
import { getTelegramLinkConfig, getFacebookAppId } from '~/server/auth'
import { CartProvider } from '~/components/storefront/CartContext'
import { StorefrontThemeProvider } from '~/components/storefront/StorefrontThemeProvider'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/s/$slug')({
  loader: async ({ params }) => {
    const [store, viewerMerchantId, telegramConfig, fbAppIdResult] = await Promise.all([
      getPublicStoreBySlug({ data: { slug: params.slug } }),
      getCurrentMerchantId(),
      getTelegramLinkConfig(),
      getFacebookAppId(),
    ])
    if (!store) throw notFound()
    // Only the logged-in merchant who owns this exact store sees the
    // "Manage my store" link — every other visitor (including other
    // logged-in merchants) sees the page exactly as a buyer would.
    const isOwner = viewerMerchantId !== null && viewerMerchantId === store.merchantId
    return { store, isOwner, telegramConfig, fbAppId: fbAppIdResult.fbAppId }
  },
  component: () => (
    <LocaleProvider>
      <StorefrontLayout />
    </LocaleProvider>
  ),
})

function StorefrontLayout() {
  const { dir } = useLocale()
  const { store } = Route.useLoaderData()
  return (
    <CartProvider>
      <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
        <StorefrontThemeProvider themeId={store.themeId}>
          <Outlet />
        </StorefrontThemeProvider>
      </div>
    </CartProvider>
  )
}


