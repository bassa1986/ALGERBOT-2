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
  const { store } = parentRoute.useLoaderData()
  const { products: initialProducts, categories } = Route.useLoaderData()
  const params = Route.useParams()
  const { t } = useLocale()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined)
  const [listView, setListView] = useState(false) // grocery-only toggle
  const [sharedProductId, setSharedProductId] = useState<string | null>(null)

  // Deep-link routing: a t.me/algerbot/store?startapp=<product_id> link
  // (opened from Telegram directly, or resolved via the /share/product/$id
  // landing page's redirect for external channels) surfaces here as
  // Telegram's start_param. Per spec, the buyer stays on this listing page
  // and the matching card scrolls into view + highlights, rather than
  // navigating to a separate detail page — see useScrollToSharedProduct.
  useEffect(() => {
    const startParam = getStartParam()
    if (startParam) {
      setSharedProductId(startParam)
      // A deep-linked product should be reachable even if a category
      // filter or leftover search text would otherwise hide it — clear
      // both so the scroll target is guaranteed to be in filteredProducts.
      setSelectedCategory(undefined)
      setSearch('')
    }
  }, [])

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
      <StorefrontHeader store={store} />

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
        />
      </div>
    </div>
  )
}
