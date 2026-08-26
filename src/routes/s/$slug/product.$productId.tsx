import { createFileRoute, Link, getRouteApi, notFound, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { getPublicProduct, listPublicProducts, type PublicProductCard, type PublicProductDetail } from '~/server/storefront-public'
import { useCart } from '~/components/storefront/CartContext'
import { CartButton } from '~/components/storefront/CartButton'
import { useEntranceAnimation, useScrollReveal } from '~/lib/useScrollReveal'
import { ProductGrid } from '~/components/storefront/ProductGrid'
import { useIsInsideTelegram, useTelegramBackButton } from '~/lib/useTelegramWebApp'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'

const parentRoute = getRouteApi('/s/$slug')

export const Route = createFileRoute('/s/$slug/product/$productId')({
  loader: async ({ params }) => {
    const product = await getPublicProduct({ data: { productId: params.productId } })
    if (!product) throw notFound()

    // furniture: related product suggestions from the same store, per spec
    const related = await listPublicProducts({ data: { storeSlug: params.slug } })
    return { product, related: related.filter((p: PublicProductCard) => p.id !== product.id).slice(0, 4) }
  },
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { store } = parentRoute.useLoaderData()
  const { product, related } = Route.useLoaderData()
  const params = Route.useParams()
  const cart = useCart()
  const { locale, t } = useLocale()

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants[0]?.id ?? null,
  )
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [isZoomed, setIsZoomed] = useState(false)

  const selectedVariant =
    product.variants.find((v: PublicProductDetail['variants'][number]) => v.id === selectedVariantId) ?? null
  const unitPriceCentimes = product.priceCentimes + (selectedVariant?.priceDeltaCentimes ?? 0)
  const maxStock = selectedVariant?.stockQuantity ?? (product.variants.length === 0 ? 999 : 0)
  const isOutOfStock = product.variants.length > 0 ? maxStock <= 0 : false

  const variant = store.layoutVariant

  const galleryRef = useScrollReveal<HTMLDivElement>({ selector: '.gallery-thumb', yOffset: 8 })
  const stickyBarRef = useEntranceAnimation<HTMLDivElement>(
    { y: 60, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.4 },
  )

  const navigate = useNavigate()
  useTelegramBackButton(() => {
    navigate({ to: '/s/$slug', params: { slug: params.slug } })
  }, [params.slug])

  const isInTelegram = useIsInsideTelegram()

  function handleAddToCart() {
    cart.addItem(
      {
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        name: product.name,
        variantLabel: selectedVariant?.label ?? null,
        unitPriceCentimes,
        imageUrl: product.imageUrls[0] ?? null,
        maxStock,
      },
      1,
    )
  }

  return (
    <div className={variant === 'fashion' ? 'pb-24' : ''}>
      <div className="flex items-center justify-between p-4">
        {!isInTelegram && (
          <Link to="/s/$slug" params={{ slug: params.slug }} className="text-sm text-[var(--color-text-muted)]">
            {locale === 'ar' ? '← رجوع' : '← Retour'}
          </Link>
        )}
        <CartButton storeSlug={params.slug} />
      </div>

      {/* Image gallery. electronics gets a zoom affordance; others plain. */}
      <div className="px-4">
        <div
          className={`relative overflow-hidden rounded-2xl bg-[var(--color-surface-muted)] ${
            variant === 'furniture' ? 'aspect-[4/3]' : 'aspect-square'
          } ${variant === 'electronics' ? 'cursor-zoom-in' : ''}`}
          onClick={() => variant === 'electronics' && setIsZoomed((z) => !z)}
        >
          {product.imageUrls[activeImageIndex] && (
            <img
              src={product.imageUrls[activeImageIndex]}
              alt={product.name}
              className={`h-full w-full object-cover transition-transform duration-300 ${
                isZoomed ? 'scale-150' : 'scale-100'
              }`}
            />
          )}
          {variant === 'electronics' && (
            <span className="absolute bottom-2 end-2 rounded-full bg-black/50 px-2 py-1 text-[10px] text-white">
              {isZoomed ? t.tapToShrink : t.tapToZoom}
            </span>
          )}
        </div>

        {product.imageUrls.length > 1 && (
          <div ref={galleryRef} className="flex gap-2 mt-2 overflow-x-auto">
            {product.imageUrls.map((url: string, i: number) => (
              <button
                key={url}
                onClick={() => setActiveImageIndex(i)}
                className={`gallery-thumb h-16 w-16 shrink-0 rounded-lg overflow-hidden border-2 ${
                  i === activeImageIndex ? 'border-[var(--color-action-primary)]' : 'border-transparent'
                }`}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{product.name}</h1>
        <p className="text-lg font-semibold text-[var(--color-action-primary)] mt-1">
          {formatDzd(unitPriceCentimes, locale)}
        </p>

        {/* furniture: dimensions shown clearly, parsed from description if
            present, otherwise the description itself covers it — the
            schema has no dedicated dimensions field, so this surfaces the
            description prominently under a "Dimensions et détails" heading
            rather than burying it, per spec intent. */}
        {variant === 'furniture' && product.description && (
          <div className="mt-4 rounded-xl bg-[var(--color-surface)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
              {t.dimensionsAndDetails}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] whitespace-pre-line">
              {product.description}
            </p>
          </div>
        )}

        {/* electronics: spec table prominently, not buried in prose —
            parses simple "Label: value" lines from the description into
            table rows when present, else shows the raw description. */}
        {variant === 'electronics' && product.description && (
          <SpecTable description={product.description} specificationsLabel={t.specifications} />
        )}

        {/* general/fashion/grocery: plain description */}
        {variant !== 'furniture' && variant !== 'electronics' && product.description && (
          <p className="text-sm text-[var(--color-text-muted)] mt-3 whitespace-pre-line">
            {product.description}
          </p>
        )}

        {/* Variant picker — shown for any variant type when the product
            has variants, but styled as part of the sticky bar for fashion. */}
        {product.variants.length > 0 && variant !== 'fashion' && (
          <VariantPicker
            variants={product.variants}
            selectedId={selectedVariantId}
            onSelect={setSelectedVariantId}
          />
        )}

        {variant !== 'fashion' && (
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className="mt-4 w-full rounded-full bg-[var(--color-action-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {isOutOfStock ? t.outOfStock : t.addToCart}
          </button>
        )}

        {/* furniture: related/bundle product suggestions */}
        {variant === 'furniture' && related.length > 0 && (
          <div className="mt-8">
            <h2 className="font-semibold text-[var(--color-text-primary)] mb-3">
              {t.youMayAlsoLike}
            </h2>
            <ProductGrid products={related} storeSlug={params.slug} variant={variant} />
          </div>
        )}
      </div>

      {/* fashion: sticky add-to-cart bar with variant picker, per spec */}
      {variant === 'fashion' && (
        <div
          ref={stickyBarRef}
          className="fixed bottom-0 inset-x-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] p-3 shadow-lg"
        >
          {product.variants.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                {product.variants.map((v: PublicProductDetail['variants'][number]) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  disabled={v.stockQuantity <= 0}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-30 ${
                    selectedVariantId === v.id
                      ? 'bg-[var(--color-action-primary)] text-white'
                      : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {isOutOfStock ? t.outOfStock : `${t.addWithPrice} ${formatDzd(unitPriceCentimes, locale)}`}
          </button>
        </div>
      )}
    </div>
  )
}

function VariantPicker({
  variants,
  selectedId,
  onSelect,
}: {
  variants: { id: string; label: string; stockQuantity: number }[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap mt-4">
      {variants.map((v) => (
        <button
          key={v.id}
          onClick={() => onSelect(v.id)}
          disabled={v.stockQuantity <= 0}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-30 ${
            selectedId === v.id
              ? 'bg-[var(--color-action-primary)] text-white'
              : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

/** Parses "Label: value" lines from a description into a spec table; falls
 * back to plain text when no such lines are found. */
function SpecTable({ description, specificationsLabel }: { description: string; specificationsLabel: string }) {
  const lines = description.split('\n').map((l) => l.trim()).filter(Boolean)
  const specRows = lines
    .map((line) => {
      const match = line.match(/^([^:]{1,40}):\s*(.+)$/)
      return match ? { label: match[1], value: match[2] } : null
    })
    .filter((row): row is { label: string; value: string } => row !== null)

  if (specRows.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)] mt-3 whitespace-pre-line">{description}</p>
  }

  return (
    <div className="mt-4 rounded-xl bg-[var(--color-surface)] overflow-hidden">
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)] px-4 pt-3 pb-1">
        {specificationsLabel}
      </h2>
      <table className="w-full text-sm">
        <tbody>
          {specRows.map((row) => (
            <tr key={row.label} className="border-t border-[var(--color-border)]">
              <td className="px-4 py-2 text-[var(--color-text-muted)] w-1/3">{row.label}</td>
              <td className="px-4 py-2 text-[var(--color-text-primary)]">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
