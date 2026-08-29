import type { PublicProductCard } from '~/server/storefront-public'
import type { StoreLayoutVariant } from '~/server/store'
import { ProductCard } from './ProductCard'
import { useScrollReveal } from '~/lib/useScrollReveal'
import { useLocale } from '~/lib/i18n/LocaleContext'

/**
 * One grid component for every variant. Column count/gap and grid-vs-list
 * mode are the only things that change per variant — same ProductCard,
 * same data shape, same reveal animation.
 */
export function ProductGrid({
  products,
  storeSlug,
  variant,
  listView = false,
}: {
  products: PublicProductCard[]
  storeSlug: string
  variant: StoreLayoutVariant
  listView?: boolean
}) {
  const containerRef = useScrollReveal<HTMLDivElement>({
    selector: '.reveal-item',
    enabled: products.length > 0,
  })
  const { t } = useLocale()

  if (products.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">
        {t.noProductsFound}
      </p>
    )
  }

  if (listView) {
    return (
      <div ref={containerRef} className="space-y-2">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} storeSlug={storeSlug} variant={variant} listView />
        ))}
      </div>
    )
  }

  // Grid density per variant:
  // - fashion: full-bleed 2-column on mobile, tighter gap, larger portrait cards
  // - furniture: lower density (fewer columns even on larger screens), more whitespace
  // - electronics/grocery/general: standard responsive 2→3→4 column grid
  const gridClass =
    variant === 'fashion'
      ? 'grid grid-cols-2 gap-0.5 sm:gap-2'
      : variant === 'furniture'
        ? 'grid grid-cols-1 sm:grid-cols-2 gap-6'
        : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'

  return (
    <div ref={containerRef} className={gridClass}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} storeSlug={storeSlug} variant={variant} />
      ))}
    </div>
  )
}


