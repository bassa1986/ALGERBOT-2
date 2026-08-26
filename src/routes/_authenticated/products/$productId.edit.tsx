import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import {
  getMyProduct,
  updateMyProduct,
  createMyVariant,
  updateMyVariant,
  deleteMyVariant,
} from '~/server/products'
import { listCategories } from '~/server/categories'
import { reorderProductImages, setProductCoverImage, deleteProductImage } from '~/server/product-images'
import { PhotoGallery } from '~/components/PhotoGallery'
import { useProductPhotoUpload } from '~/lib/useProductPhotoUpload'
import { useLocale } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/_authenticated/products/$productId/edit')({
  loader: async ({ params }) => {
    const [product, categories] = await Promise.all([
      getMyProduct({ data: { productId: params.productId } }),
      listCategories(),
    ])
    return { product, categories }
  },
  component: EditProductPage,
})

function EditProductPage() {
  const { product, categories } = Route.useLoaderData()
  const router = useRouter()
  const { t, dir } = useLocale()
  const m = t.merchant

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4 space-y-6" dir={dir}>
      <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
        {m.editProductTitle} {product.name}
      </h1>

      <ProductFieldsSection
        product={product}
        categories={categories}
        onSaved={() => router.invalidate({ sync: true })}
        m={m}
      />

      <PhotosSection product={product} onChanged={() => router.invalidate({ sync: true })} m={m} />

      <VariantsSection product={product} onChanged={() => router.invalidate({ sync: true })} m={m} />
    </div>
  )
}

function ProductFieldsSection({
  product,
  categories,
  onSaved,
  m,
}: {
  product: Awaited<ReturnType<typeof getMyProduct>>
  categories: Awaited<ReturnType<typeof listCategories>>
  onSaved: () => void
  m: import('~/lib/i18n/translations').MerchantDictionary
}) {
  const { locale } = useLocale()
  const updateProduct = useServerFn(updateMyProduct)
  const [sku, setSku] = useState(product.sku)
  const [name, setName] = useState(product.name)
  const [description, setDescription] = useState(product.description ?? '')
  const [priceDzd, setPriceDzd] = useState((product.priceCentimes / 100).toFixed(2))
  const [categoryId, setCategoryId] = useState(product.categoryId ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    const priceCentimes = Math.round(parseFloat(priceDzd) * 100)
    if (!sku.trim() || !name.trim() || Number.isNaN(priceCentimes) || priceCentimes < 0) {
      setError('Veuillez remplir le SKU, le nom et un prix valide')
      return
    }
    setIsSaving(true)
    try {
      await updateProduct({
        data: {
          productId: product.id,
          sku: sku.trim(),
          name: name.trim(),
          description: description.trim() || null,
          priceCentimes,
          categoryId: categoryId || null,
        },
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-lg">
      <h2 className="font-semibold text-[var(--color-text-primary)] mb-4">{m.details}</h2>

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{m.sku}</label>
      <input
        type="text"
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
      />

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">{m.name}</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
      />

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {m.description}
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
      />

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {m.price} (DZD)
      </label>
      <input
        type="number"
        min={0}
        step={0.01}
        value={priceDzd}
        onChange={(e) => setPriceDzd(e.target.value)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
      />

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {m.category}
      </label>
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
      >
        <option value="">{m.none}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {locale === 'ar' ? c.nameAr : c.nameFr}
          </option>
        ))}
      </select>

      {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isSaving ? m.saving : m.save}
      </button>
    </section>
  )
}

function PhotosSection({
  product,
  onChanged,
  m,
}: {
  product: Awaited<ReturnType<typeof getMyProduct>>
  onChanged: () => void
  m: import('~/lib/i18n/translations').MerchantDictionary
}) {
  const reorder = useServerFn(reorderProductImages)
  const setCover = useServerFn(setProductCoverImage)
  const deleteImage = useServerFn(deleteProductImage)
  const { uploadFiles, isUploading, error } = useProductPhotoUpload(
    product.id,
    product.images.length,
  )

  return (
    <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-lg">
      <h2 className="font-semibold text-[var(--color-text-primary)] mb-4">{m.photos}</h2>

      <PhotoGallery
        images={product.images.map((img) => ({ id: img.id, url: img.url, isCover: img.isCover }))}
        onReorder={async (orderedIds) => {
          await reorder({ data: { productId: product.id, orderedImageIds: orderedIds } })
          onChanged()
        }}
        onSetCover={async (imageId) => {
          await setCover({ data: { productId: product.id, imageId } })
          onChanged()
        }}
        onDelete={async (imageId) => {
          await deleteImage({ data: { productId: product.id, imageId } })
          onChanged()
        }}
        disabled={isUploading}
      />

      <div className="mt-3 flex gap-2">
        <label className="rounded-full border border-[var(--color-border)] px-3 py-2 text-sm cursor-pointer">
          Choisir des photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={isUploading || product.images.length >= 6}
            onChange={async (e) => {
              if (e.target.files) {
                await uploadFiles(e.target.files)
                onChanged()
              }
              e.target.value = ''
            }}
          />
        </label>

        <label className="rounded-full border border-[var(--color-border)] px-3 py-2 text-sm cursor-pointer">
          📷 Prendre une photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={isUploading || product.images.length >= 6}
            onChange={async (e) => {
              if (e.target.files) {
                await uploadFiles(e.target.files)
                onChanged()
              }
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {isUploading && <p className="text-sm text-[var(--color-text-muted)] mt-2">Téléversement...</p>}
      {error && <p className="text-sm text-[var(--color-danger)] mt-2">{error}</p>}
    </section>
  )
}

function VariantsSection({
  product,
  onChanged,
  m,
}: {
  product: Awaited<ReturnType<typeof getMyProduct>>
  onChanged: () => void
  m: import('~/lib/i18n/translations').MerchantDictionary
}) {
  const createVariant = useServerFn(createMyVariant)
  const updateVariant = useServerFn(updateMyVariant)
  const deleteVariant = useServerFn(deleteMyVariant)

  const [label, setLabel] = useState('')
  const [priceDeltaDzd, setPriceDeltaDzd] = useState('0')
  const [stock, setStock] = useState('0')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!label.trim()) {
      setError('Le libellé de la variante est requis')
      return
    }
    setIsAdding(true)
    try {
      await createVariant({
        data: {
          productId: product.id,
          label: label.trim(),
          priceDeltaCentimes: Math.round(parseFloat(priceDeltaDzd || '0') * 100),
          stockQuantity: parseInt(stock || '0', 10),
        },
      })
      setLabel('')
      setPriceDeltaDzd('0')
      setStock('0')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'ajout")
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-lg">
      <h2 className="font-semibold text-[var(--color-text-primary)] mb-4">{m.variants}</h2>

      <div className="space-y-2 mb-4">
        {product.variants.map((v) => (
          <VariantRow
            key={v.id}
            variant={v}
            m={m}
            onDelete={async () => {
              await deleteVariant({ data: { variantId: v.id } })
              onChanged()
            }}
          />
        ))}
        {product.variants.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{m.noVariants}</p>
        )}
      </div>

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-4"
      >
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{m.variantLabel}</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex : Rouge / XL"
            className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">
            {m.priceAdjustment} (DZD)
          </label>
          <input
            type="number"
            step={0.01}
            value={priceDeltaDzd}
            onChange={(e) => setPriceDeltaDzd(e.target.value)}
            className="w-24 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{m.initialStock}</label>
          <input
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-20 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isAdding}
          className="rounded-full bg-[var(--color-action-primary)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {m.addVariant}
        </button>
      </form>
      {error && <p className="text-sm text-[var(--color-danger)] mt-2">{error}</p>}
    </section>
  )
}

function VariantRow({
  variant,
  onDelete,
  m,
}: {
  variant: Awaited<ReturnType<typeof getMyProduct>>['variants'][number]
  onDelete: () => Promise<void>
  m: import('~/lib/i18n/translations').MerchantDictionary
}) {
  const [isBusy, setIsBusy] = useState(false)

  async function handleDelete() {
    if (!window.confirm(`${m.delete} "${variant.label}"?`)) return
    setIsBusy(true)
    try {
      await onDelete()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
      <div>
        <span className="font-medium text-[var(--color-text-primary)]">{variant.label}</span>
        <span className="text-[var(--color-text-muted)]">
          {' '}
          · {variant.priceDeltaCentimes >= 0 ? '+' : ''}
          {(variant.priceDeltaCentimes / 100).toFixed(2)} DZD · {m.stock} {variant.stockQuantity}
        </span>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isBusy}
        className="text-[var(--color-danger)] text-xs"
      >
        {m.delete}
      </button>
    </div>
  )
}
