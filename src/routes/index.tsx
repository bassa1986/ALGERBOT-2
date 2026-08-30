import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  listMarketplaceStores,
  searchMarketplaceProducts,
  listMarketplaceCategoriesInUse,
  type MarketplaceProductCard,
  type MarketplaceStoreCard,
  type MarketplaceCategory,
} from '~/server/marketplace'
import { useScrollReveal } from '~/lib/useScrollReveal'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'
import { SiteNav } from '~/components/storefront/SiteNav'
import { SiteFooter } from '~/components/storefront/SiteFooter'
import { PricingSection } from '~/components/storefront/PricingSection'
import { getPublicPricingInfo } from '~/server/billing'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [stores, products, categories, pricing] = await Promise.all([
      listMarketplaceStores(),
      searchMarketplaceProducts({ data: {} }),
      listMarketplaceCategoriesInUse(),
      getPublicPricingInfo(),
    ])
    return { stores, products, categories, pricing }
  },
  component: () => (
    <LocaleProvider>
      <MarketplaceHome />
    </LocaleProvider>
  ),
})

function MarketplaceHome() {
  const { stores, categories, products: initialProducts, pricing } = Route.useLoaderData()
  const search = useServerFn(searchMarketplaceProducts)
  const { locale, t, dir } = useLocale()

  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined)
  const [products, setProducts] = useState<MarketplaceProductCard[]>(initialProducts)

  // Re-query the server whenever search text or category changes — cross-
  // store search isn't a small enough dataset to filter client-side the
  // way the single-store storefront page does, so this hits the server
  // function directly (debounced on the text input).
  useEffect(() => {
    const handle = setTimeout(() => {
      search({ data: { q: query || undefined, categorySlug: selectedCategory } }).then(setProducts)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, selectedCategory, search])

  const gridRef = useScrollReveal<HTMLDivElement>({
    selector: '.reveal-item',
    enabled: products.length > 0,
  })
  const storesRef = useScrollReveal<HTMLDivElement>({
    selector: '.store-tile',
    enabled: stores.length > 0,
  })

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
      <header className="flex items-center justify-between p-4">
        <div className="flex-1" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t.appTagline}</p>
        </div>
        <div className="flex-1 flex justify-end">
          <LanguageSwitch />
        </div>
      </header>
      <SiteNav />

      <div className="px-4 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm"
        />
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 -mx-4">
          <button
            onClick={() => setSelectedCategory(undefined)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              !selectedCategory
                ? 'bg-[var(--color-action-primary)] text-white'
                : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
            }`}
          >
            {t.categoriesAll}
          </button>
          {categories.map((c: MarketplaceCategory) => (
            <button
              key={c.slug}
              onClick={() => setSelectedCategory(c.slug)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                selectedCategory === c.slug
                  ? 'bg-[var(--color-action-primary)] text-white'
                  : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
              }`}
            >
              {locale === 'ar' ? c.nameAr : c.nameFr}
            </button>
          ))}
        </div>
      )}

      {stores.length > 0 && (
        <div className="mb-4">
          <h2 className="px-4 text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            {t.stores}
          </h2>
          <div ref={storesRef} className="flex gap-3 overflow-x-auto px-4">
            {stores.map((store: MarketplaceStoreCard) => (
              <Link
                key={store.slug}
                to="/s/$slug"
                params={{ slug: store.slug }}
                className="store-tile shrink-0 flex flex-col items-center gap-1 w-16"
              >
                <span className="h-14 w-14 rounded-full overflow-hidden bg-[var(--color-surface)] border border-[var(--color-border)]">
                  {store.logoUrl && (
                    <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="text-[10px] text-[var(--color-text-primary)] text-center truncate w-full">
                  {store.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-8">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">{t.products}</h2>
        {products.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t.noProductsFound}</p>
        ) : (
          <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p: MarketplaceProductCard) => (
              <Link
                key={p.id}
                to="/s/$slug/product/$productId"
                params={{ slug: p.storeSlug, productId: p.id }}
                className="reveal-item block rounded-2xl bg-[var(--color-surface)] shadow-sm overflow-hidden"
              >
                <div className="aspect-square bg-[var(--color-surface-muted)]">
                  {p.coverImageUrl && (
                    <img src={p.coverImageUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="p-3">
                  <p className="font-medium text-[var(--color-text-primary)] truncate">{p.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{p.storeName}</p>
                  <p className="text-sm font-semibold text-[var(--color-action-primary)]">
                    {formatDzd(p.priceCentimes, locale)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-8 text-center">
        <Link to="/order-lookup" className="text-sm text-[var(--color-text-muted)] underline">
          {t.trackOrder}
        </Link>
        </div>
        <PricingSection pricing={pricing} />
        <SiteFooter />
        </div>
        )
        }

