import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  listMarketplaceStores,
  searchMarketplaceProducts,
  listMarketplaceCategoriesInUse,
  listMarketplaceWilayasInUse,
  listMarketplaceCommunesInUse,
  type MarketplaceProductCard,
  type MarketplaceStoreCard,
  type MarketplaceCategory,
  type MarketplaceWilaya,
  type MarketplaceCommune,
} from '~/server/marketplace'
import { useScrollReveal } from '~/lib/useScrollReveal'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'
import { SiteNav } from '~/components/storefront/SiteNav'
import { SiteFooter } from '~/components/storefront/SiteFooter'
import { CategoryIcon } from '~/components/storefront/CategoryIcons'
import { PinIcon } from '~/components/storefront/Icons'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [stores, products, categories, wilayas] = await Promise.all([
      listMarketplaceStores(),
      searchMarketplaceProducts({ data: {} }),
      listMarketplaceCategoriesInUse(),
      listMarketplaceWilayasInUse(),
    ])
    return { stores, products, categories, wilayas }
  },
  component: () => (
    <LocaleProvider>
      <MarketplaceHome />
    </LocaleProvider>
  ),
})

function MarketplaceHome() {
  const { stores, categories, wilayas, products: initialProducts } = Route.useLoaderData()
  const search = useServerFn(searchMarketplaceProducts)
  const fetchCommunes = useServerFn(listMarketplaceCommunesInUse)
  const { locale, t, dir } = useLocale()

  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined)
  const [selectedWilaya, setSelectedWilaya] = useState<number | undefined>(undefined)
  const [selectedCommune, setSelectedCommune] = useState<number | undefined>(undefined)
  const [communes, setCommunes] = useState<MarketplaceCommune[]>([])
  const [products, setProducts] = useState<MarketplaceProductCard[]>(initialProducts)
  const [isSearching, setIsSearching] = useState(false)

  // The commune filter is scoped to whichever wilaya is currently
  // selected — reload its options whenever the wilaya changes, and clear
  // any previously-selected commune since it belonged to the old wilaya.
  useEffect(() => {
    setSelectedCommune(undefined)
    if (selectedWilaya === undefined) {
      setCommunes([])
      return
    }
    let cancelled = false
    fetchCommunes({ data: { wilayaCode: selectedWilaya } }).then((rows) => {
      if (!cancelled) setCommunes(rows)
    })
    return () => {
      cancelled = true
    }
  }, [selectedWilaya, fetchCommunes])

  // Re-query the server whenever search text, category, wilaya, or commune
  // changes — cross-store search isn't a small enough dataset to filter
  // client-side the way the single-store storefront page does, so this
  // hits the server function directly (debounced on the text input).
  useEffect(() => {
    const handle = setTimeout(() => {
      setIsSearching(true)
      search({
        data: {
          q: query || undefined,
          categorySlug: selectedCategory,
          wilayaCode: selectedWilaya,
          communeCode: selectedCommune,
        },
      })
        .then(setProducts)
        .finally(() => setIsSearching(false))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, selectedCategory, selectedWilaya, selectedCommune, search])

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
          <h1 className="app-title text-2xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
          <p className="text-base font-extrabold text-[var(--color-text-muted)]">{t.appTagline}</p>
        </div>
        <div className="flex-1 flex justify-end">
          <LanguageSwitch />
        </div>
      </header>
      <SiteNav />

      {/* Location band — given its own visual weight, ahead of search, since
          browsing by wilaya/commune is this marketplace's primary lens, not
          a secondary filter buried in a dropdown stack. */}
      {wilayas.length > 0 && (
        <div className="mx-4 mb-3 rounded-2xl border border-[var(--color-saffron)] bg-[var(--color-saffron-light)]/30 p-3">
          <p className="mb-2 text-xs font-bold text-[var(--color-text-primary)]">{t.locationBandLabel}</p>
          <div className="flex gap-2">
            <select
              value={selectedWilaya ?? ''}
              onChange={(e) => setSelectedWilaya(e.target.value ? Number(e.target.value) : undefined)}
              className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">{t.wilayaFilterAll}</option>
              {wilayas.map((w: MarketplaceWilaya) => (
                <option key={w.code} value={w.code}>
                  {w.code.toString().padStart(2, '0')} — {locale === 'ar' ? w.nameAr : w.nameFr}
                </option>
              ))}
            </select>
            {selectedWilaya !== undefined && communes.length > 0 && (
              <select
                value={selectedCommune ?? ''}
                onChange={(e) => setSelectedCommune(e.target.value ? Number(e.target.value) : undefined)}
                className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
              >
                <option value="">{t.communeFilterAll}</option>
                {communes.map((c: MarketplaceCommune) => (
                  <option key={c.code} value={c.code}>
                    {locale === 'ar' ? c.nameAr : c.nameFr}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div className="px-4 mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm"
        />
      </div>

      {/* Category browsing — the primary "where do I start" gesture for
          this marketplace, so it's a tile grid (icon + label, all visible
          at once) rather than a horizontally-scrolling chip row that hides
          most options off-screen. */}
      {categories.length > 0 && (
        <div className="px-4 mb-4">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSelectedCategory(undefined)}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 ${
                !selectedCategory
                  ? 'bg-[var(--color-action-primary)] text-white'
                  : 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span className="text-[10px] font-semibold leading-tight text-center">{t.categoriesAll}</span>
            </button>
            {categories.map((c: MarketplaceCategory) => (
              <button
                key={c.slug}
                onClick={() => setSelectedCategory(c.slug)}
                className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 ${
                  selectedCategory === c.slug
                    ? 'bg-[var(--color-action-primary)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-primary)]'
                }`}
              >
                <CategoryIcon slug={c.slug} className="h-6 w-6" />
                <span className="text-[10px] font-semibold leading-tight text-center line-clamp-2">
                  {locale === 'ar' ? c.nameAr : c.nameFr}
                </span>
              </button>
            ))}
          </div>
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
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          {t.products}
          {isSearching && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-action-primary)] border-t-transparent" />
          )}
        </h2>
        {products.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t.noProductsFound}</p>
        ) : (
          <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {products.map((p: MarketplaceProductCard) => {
              const communeName = locale === 'ar' ? p.communeNameAr : p.communeNameFr
              const isNew = Date.now() - new Date(p.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000
              return (
                <Link
                  key={p.id}
                  to="/s/$slug"
                  params={{ slug: p.storeSlug }}
                  search={{ product: p.id }}
                  className="reveal-item relative block rounded-2xl bg-[var(--color-surface)] shadow-sm overflow-hidden"
                >
                  {isNew && (
                    <span className="absolute top-2 start-2 z-10 rounded-full bg-[var(--color-saffron)] px-2 py-0.5 text-[10px] font-bold text-white">
                      {t.newListingBadge}
                    </span>
                  )}
                  <div className="aspect-square bg-[var(--color-surface-muted)]">
                    {p.coverImageUrl && (
                      <img src={p.coverImageUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-lg font-black leading-tight text-[var(--color-action-primary)]">
                      {formatDzd(p.priceCentimes, locale)}
                    </p>
                    <p className="text-sm leading-snug text-[var(--color-text-primary)] truncate">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--color-text-muted)] truncate">
                      <PinIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {p.storeName}
                        {communeName ? ` · ${communeName}` : ''}
                      </span>
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-4 pb-8 text-center">
        <Link to="/order-lookup" className="text-sm text-[var(--color-text-muted)] underline">
          {t.trackOrder}
        </Link>
        </div>
        <SiteFooter />
        </div>
        )
        }

