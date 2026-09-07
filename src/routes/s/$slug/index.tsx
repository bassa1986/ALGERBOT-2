import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useEffect } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { listPublicProducts, listStoreCategoriesInUse, type PublicProductCard } from '~/server/storefront-public'
import { StorefrontHeader } from '~/components/storefront/StorefrontHeader'
import { CategoryNav } from '~/components/storefront/CategoryNav'
import { BentoCategoryGrid } from '~/components/storefront/BentoCategoryGrid'
import { SearchBar } from '~/components/storefront/SearchBar'
import { ProductGrid } from '~/components/storefront/ProductGrid'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { getStartParam, useScrollToSharedProduct } from '~/lib/useDeepLinkRouting'

const parentRoute = getRouteApi('/s/$slug')

export const Route = createFileRoute('/s/$slug/')({
  // Supports /s/{slug}?product={id} as a direct, non-Telegram deep link:
  // the homepage's product grid links here (not to the standalone detail
  // page) so clicking a product from the marketplace lands the buyer
  // inside the real store, scrolled to that exact item — reinforcing
  // "you're in a shop" rather than "here's an isolated ad". Reuses the
  // exact same scroll/highlight mechanism already built for Telegram's
  // start_param deep links (see useScrollToSharedProduct below).
  validateSearch: (search: Record<string, unknown>) => ({
    product: typeof search.product === 'string' ? search.product : undefined,
  }),
  loader: async ({ params }) => {
    const [products, categories] = await Promise.all([
      listPublicProducts({ data: { storeSlug: params.slug } }),
      listStoreCategoriesInUse({ data: { storeSlug: params.slug } }),
    ])
    return { products, categories }
  },
  component: StorefrontHome,
})

function StorefrontHome() {
  const { store, isOwner, telegramConfig, fbAppId } = parentRoute.useLoaderData()
  const { products: initialProducts, categories } = Route.useLoaderData()
  const params = Route.useParams()
  const routeSearch = Route.useSearch()
  const { t } = useLocale()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined)
  const [listView, setListView] = useState(false) // grocery-only toggle
  const [sharedProductId, setSharedProductId] = useState<string | null>(null)

  // Deep-link routing: a product can be requested two ways —
  //   1. Telegram's t.me/algerbot/store?startapp=<product_id> (opened
  //      directly in Telegram, or resolved via /share/product/$id's
  //      redirect for external channels) — surfaces as start_param.
  //   2. A plain ?product=<id> query param — used by the marketplace
  //      homepage's own product cards (see src/routes/index.tsx), so
  //      browsing the marketplace and clicking an item lands here rather
  //      than on a separate, isolated detail page.
  // Either way, the buyer stays on this listing page and the matching
  // card scrolls into view + highlights — see useScrollToSharedProduct.
  useEffect(() => {
    const startParam = getStartParam()
    const targetProductId = startParam || routeSearch.product
    if (targetProductId) {
      setSharedProductId(targetProductId)
      // A deep-linked product should be reachable even if a category
      // filter or leftover search text would otherwise hide it — clear
      // both so the scroll target is guaranteed to be in filteredProducts.
      setSelectedCategory(undefined)
      setSearch('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run if the search param itself changes, not on every render
  }, [routeSearch.product])

  useScrollToSharedProduct(sharedProductId)

  // Client-side filter over the already-loaded product list. A full
  // implementation might re-query the server per filter change (as the
  // category/search server function already supports), but for a single
  // store's catalog size, filtering client-side avoids a network round
  // trip per keystroke and keeps the UI snappy.
  const filteredProducts = useMemo(() => {
    return initialProducts.filter((p: PublicProductCard) => {
      if (selectedCategory && p.categorySlug !== selectedCategory) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [initialProducts, selectedCategory, search])

  const variant = store.layoutVariant

  return (
    <div>
      <StorefrontHeader store={store} isOwner={isOwner} telegramConfig={telegramConfig} fbAppId={fbAppId} />

      <SearchBar value={search} onChange={setSearch} />

      <CategoryNav
        categories={categories}
        variant={variant}
        selectedSlug={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* general: bento category grid as a distinct home-page element,
          only shown when no filter is active (it's a browse aid, not a
          persistent nav once the buyer has already drilled in). */}
      {variant === 'general' && !selectedCategory && !search && categories.length > 0 && (
        <BentoCategoryGrid categories={categories} onSelect={setSelectedCategory} />
      )}

      {/* grocery: grid/list toggle, in addition to the icon bar above */}
      {variant === 'grocery' && (
        <div className="flex justify-end gap-2 px-4 pb-2">
          <button
            onClick={() => setListView(false)}
            className={`text-xs font-semibold px-2 py-1 rounded-full ${
              !listView ? 'bg-[var(--color-action-primary)] text-white' : 'text-[var(--color-text-muted)]'
            }`}
          >
            {t.gridView}
          </button>
          <button
            onClick={() => setListView(true)}
            className={`text-xs font-semibold px-2 py-1 rounded-full ${
              listView ? 'bg-[var(--color-action-primary)] text-white' : 'text-[var(--color-text-muted)]'
            }`}
          >
            {t.listView}
          </button>
        </div>
      )}

      <div className="p-4 pt-0">
        <ProductGrid
          products={filteredProducts}
          storeSlug={params.slug}
          variant={variant}
          listView={variant === 'grocery' && listView}
          telegramConfig={telegramConfig}
          fbAppId={fbAppId}
          storeName={store.name}
          merchantWhatsappNumber={store.merchantWhatsappNumber}
          merchantTelegramUsername={store.merchantTelegramUsername}
        />
      </div>
    </div>
  )
}


