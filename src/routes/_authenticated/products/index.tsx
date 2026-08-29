import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { listMyProducts, type ProductListItem, setMyProductPublished, deleteMyProduct, getMyProduct } from '~/server/products'
import { reorderProductImages, setProductCoverImage, deleteProductImage } from '~/server/product-images'
import { useProductPhotoUpload } from '~/lib/useProductPhotoUpload'
import { PhotoGallery } from '~/components/PhotoGallery'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import { buildAppLink, buildProductTelegramLink } from '~/lib/telegram-links'
import { useCopyToClipboard } from '~/lib/useCopyToClipboard'

export const Route = createFileRoute('/_authenticated/products/')({
  loader: async () => {
    const products = await listMyProducts()
    return { products }
  },
  component: ProductsListPage,
})

function ProductsListPage() {
  const { products } = Route.useLoaderData()
  const router = useRouter()
  const [expandedPhotosFor, setExpandedPhotosFor] = useState<string | null>(null)
  const { t, dir } = useLocale()
  const m = t.merchant
  const { copy: copyAppLink, copied: appLinkCopied } = useCopyToClipboard()

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <header className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{m.productsTitle}</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => copyAppLink(buildAppLink())}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {appLinkCopied ? m.linkCopied : m.copyAppLink}
          </button>
          <Link
            to="/products/import"
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {m.importExcel}
          </Link>
          <Link
            to="/products/new"
            className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            {m.addProduct}
          </Link>
        </div>
      </header>

      {products.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">
          {m.noProductsYet}
        </p>
      )}

      <div className="space-y-3">
        {products.map((product: ProductListItem) => (
          <ProductRow
            key={product.id}
            product={product}
            isPhotosExpanded={expandedPhotosFor === product.id}
            onTogglePhotos={() =>
              setExpandedPhotosFor(expandedPhotosFor === product.id ? null : product.id)
            }
            onChanged={() => router.invalidate({ sync: true })}
          />
        ))}
      </div>
    </div>
  )
}

function ProductRow({
  product,
  isPhotosExpanded,
  onTogglePhotos,
  onChanged,
}: {
  product: ProductListItem
  isPhotosExpanded: boolean
  onTogglePhotos: () => void
  onChanged: () => void
}) {
  const setPublished = useServerFn(setMyProductPublished)
  const deleteProduct = useServerFn(deleteMyProduct)
  const [isBusy, setIsBusy] = useState(false)
  const { locale, t } = useLocale()
  const m = t.merchant
  const { copy: copyProductLink, copied: linkCopied } = useCopyToClipboard()

  async function handleTogglePublish() {
    setIsBusy(true)
    try {
      await setPublished({ data: { productId: product.id, isPublished: !product.isPublished } })
      onChanged()
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`${m.delete} "${product.name}"?`)) return
    setIsBusy(true)
    try {
      await deleteProduct({ data: { productId: product.id } })
      onChanged()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-muted)]">
          {product.coverImageUrl && (
            <img src={product.coverImageUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-text-primary)] truncate">{product.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            SKU {product.sku} · {formatDzd(product.priceCentimes, locale)} · Stock {product.totalStock}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Copy Product Link — one-click copy, no native share sheet
              needed here per spec; that's the buyer-facing share menu's job. */}
          <button
            type="button"
            onClick={() => copyProductLink(buildProductTelegramLink(product.id))}
            title={m.copyProductLink}
            className="rounded-full border border-[var(--color-border)] p-2 text-xs"
          >
            {linkCopied ? '✓' : '🔗'}
          </button>

          {/* Inline photo control button — opens the gallery/camera row below */}
          <button
            type="button"
            onClick={onTogglePhotos}
            title={m.photos}
            className="rounded-full border border-[var(--color-border)] p-2 text-xs"
          >
            📷 {product.imageCount}/6
          </button>

          <Link
            to="/products/$productId/edit"
            params={{ productId: product.id }}
            className="rounded-full border border-[var(--color-border)] p-2 text-xs"
            title={m.edit}
          >
            ✎
          </Link>

          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={isBusy}
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              product.isPublished
                ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                : 'bg-[var(--color-text-muted)]/15 text-[var(--color-text-muted)]'
            }`}
          >
            {product.isPublished ? m.published : m.draft}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isBusy}
            className="rounded-full border border-[var(--color-border)] p-2 text-xs text-[var(--color-danger)]"
            title={m.delete}
          >
            🗑
          </button>
        </div>
      </div>

      {isPhotosExpanded && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <InlinePhotoControl productId={product.id} onChanged={onChanged} />
        </div>
      )}
    </div>
  )
}

/**
 * The inline per-row photo control: multi-select existing images or shoot
 * new ones, thumbnail strip with reorder/cover/delete, capped at 6 and
 * blocked past that both here and server-side. Loads full image detail
 * lazily (only when the row is expanded) rather than fetching every
 * product's full image list on the list page.
 */
function InlinePhotoControl({ productId, onChanged }: { productId: string; onChanged: () => void }) {
  const [images, setImages] = useState<{ id: string; url: string; isCover: boolean }[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const getProduct = useServerFn(getMyProduct)
  const reorder = useServerFn(reorderProductImages)
  const setCover = useServerFn(setProductCoverImage)
  const deleteImage = useServerFn(deleteProductImage)

  const { uploadFiles, isUploading, error } = useProductPhotoUpload(productId, images?.length ?? 0)

  // Load on mount (row was just expanded).
  useState(() => {
    getProduct({ data: { productId } }).then((detail) => {
      setImages(detail.images.map((img) => ({ id: img.id, url: img.url, isCover: img.isCover })))
      setIsLoading(false)
    })
  })

  async function refresh() {
    const detail = await getProduct({ data: { productId } })
    setImages(detail.images.map((img) => ({ id: img.id, url: img.url, isCover: img.isCover })))
    onChanged()
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    await uploadFiles(files)
    await refresh()
  }

  if (isLoading || images === null) {
    return <p className="text-xs text-[var(--color-text-muted)]">Chargement...</p>
  }

  return (
    <div>
      <PhotoGallery
        images={images}
        onReorder={async (orderedIds) => {
          setImages((prev) =>
            prev
              ? orderedIds.map((id) => prev.find((img) => img.id === id)!).filter(Boolean)
              : prev,
          )
          await reorder({ data: { productId, orderedImageIds: orderedIds } })
        }}
        onSetCover={async (imageId) => {
          await setCover({ data: { productId, imageId } })
          await refresh()
        }}
        onDelete={async (imageId) => {
          await deleteImage({ data: { productId, imageId } })
          await refresh()
        }}
        disabled={isUploading}
      />

      <div className="mt-2 flex gap-2">
        <label className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs cursor-pointer">
          Choisir des photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={isUploading || images.length >= 6}
            onChange={(e) => {
              handleFilesSelected(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        <label className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs cursor-pointer">
          📷 Prendre une photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={isUploading || images.length >= 6}
            onChange={(e) => {
              handleFilesSelected(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {isUploading && (
        <p className="text-xs text-[var(--color-text-muted)] mt-1">Téléversement...</p>
      )}
      {error && <p className="text-xs text-[var(--color-danger)] mt-1">{error}</p>}
    </div>
  )
}


