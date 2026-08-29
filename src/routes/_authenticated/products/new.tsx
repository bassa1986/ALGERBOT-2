import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { createMyProduct } from '~/server/products'
import { confirmProductImageUpload } from '~/server/product-images'
import { requestProductImageUpload } from '~/server/storage'
import { listCategories, type CategoryRow } from '~/server/categories'
import { resizeImageToJpeg, uploadToPresignedUrl } from '~/lib/upload'
import { PhotoGallery, type GalleryImage } from '~/components/PhotoGallery'
import { reorderProductImages, setProductCoverImage, deleteProductImage } from '~/server/product-images'
import { useLocale } from '~/lib/i18n/LocaleContext'

const MAX_IMAGES = 6

export const Route = createFileRoute('/_authenticated/products/new')({
  loader: async () => {
    const categories = await listCategories()
    return { categories }
  },
  component: NewProductPage,
})

function NewProductPage() {
  const { categories } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const { locale, t, dir } = useLocale()
  const m = t.merchant

  const createProduct = useServerFn(createMyProduct)
  const requestUpload = useServerFn(requestProductImageUpload)
  const confirmUpload = useServerFn(confirmProductImageUpload)
  const reorder = useServerFn(reorderProductImages)
  const setCover = useServerFn(setProductCoverImage)
  const deleteImage = useServerFn(deleteProductImage)

  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priceDzd, setPriceDzd] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Images can only be attached to a product that already exists in the DB
  // (product_images.product_id is a NOT NULL FK), so the flow is: create
  // the product first (on save of the base fields), then let photos be
  // added to it — matching the products-list page's own inline pattern,
  // just surfaced directly on the creation form instead of a second step.
  const [productId, setProductId] = useState<string | null>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const priceCentimes = Math.round(parseFloat(priceDzd) * 100)
    if (!sku.trim() || !name.trim() || Number.isNaN(priceCentimes) || priceCentimes < 0) {
      setError('Veuillez remplir le SKU, le nom et un prix valide')
      return
    }

    setIsSavingProduct(true)
    try {
      const result = await createProduct({
        data: {
          sku: sku.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          priceCentimes,
          categoryId: categoryId || undefined,
        },
      })
      setProductId(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création du produit')
    } finally {
      setIsSavingProduct(false)
    }
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0 || !productId) return
    setError(null)

    const remainingSlots = MAX_IMAGES - images.length
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} photos par produit`)
      return
    }

    const toUpload = Array.from(files).slice(0, remainingSlots)
    setIsUploadingPhoto(true)
    try {
      for (const file of toUpload) {
        const resized = await resizeImageToJpeg(file, 1600)
        const presign = await requestUpload({
          data: { productId, mimeType: 'image/jpeg', sizeBytes: resized.size },
        })
        if (!presign.ok) {
          setError(presign.error)
          continue
        }
        await uploadToPresignedUrl(presign.uploadUrl, resized)
        const confirmed = await confirmUpload({
          data: { productId, storageKey: presign.storageKey, url: presign.publicUrl },
        })
        setImages((prev) => [
          ...prev,
          { id: confirmed.id, url: presign.publicUrl, isCover: prev.length === 0 },
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  async function handleFinish() {
    await router.invalidate({ sync: true })
    await navigate({ to: '/products' })
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">
        {m.newProductTitle}
      </h1>

      {!productId ? (
        <form
          onSubmit={handleCreateProduct}
          className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-lg"
        >
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            {m.sku}
          </label>
          <input
            type="text"
            required
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
            placeholder="Ex : TSHIRT-001"
          />

          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
            {m.name}
          </label>
          <input
            type="text"
            required
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
            required
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
            {categories.map((c: CategoryRow) => (
              <option key={c.id} value={c.id}>
                {locale === 'ar' ? c.nameAr : c.nameFr}
              </option>
            ))}
          </select>

          {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}

          <button
            type="submit"
            disabled={isSavingProduct}
            className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {isSavingProduct ? m.creating : m.continueToPhotos}
          </button>
        </form>
      ) : (
        <div className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-lg">
          <h2 className="font-semibold text-[var(--color-text-primary)] mb-1">{m.photos}</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Ajoutez jusqu'à {MAX_IMAGES} photos. La première photo devient la couverture par défaut.
          </p>

          <PhotoGallery
            images={images}
            onReorder={async (orderedIds) => {
              setImages((prev) => orderedIds.map((id) => prev.find((img) => img.id === id)!))
              await reorder({ data: { productId, orderedImageIds: orderedIds } })
            }}
            onSetCover={async (imageId) => {
              setImages((prev) => prev.map((img) => ({ ...img, isCover: img.id === imageId })))
              await setCover({ data: { productId, imageId } })
            }}
            onDelete={async (imageId) => {
              setImages((prev) => prev.filter((img) => img.id !== imageId))
              await deleteImage({ data: { productId, imageId } })
            }}
            disabled={isUploadingPhoto}
          />

          <div className="mt-3 flex gap-2">
            <label className="rounded-full border border-[var(--color-border)] px-3 py-2 text-sm cursor-pointer">
              {m.choosePhotos}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={isUploadingPhoto || images.length >= MAX_IMAGES}
                onChange={(e) => {
                  handleFilesSelected(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>

            {/* capture="environment" opens the rear camera directly on phones */}
            <label className="rounded-full border border-[var(--color-border)] px-3 py-2 text-sm cursor-pointer">
              📷 {m.takePhoto}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={isUploadingPhoto || images.length >= MAX_IMAGES}
                onChange={(e) => {
                  handleFilesSelected(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          {isUploadingPhoto && (
            <p className="text-sm text-[var(--color-text-muted)] mt-2">{m.uploading}</p>
          )}
          {error && <p className="text-sm text-[var(--color-danger)] mt-2">{error}</p>}

          <button
            type="button"
            onClick={handleFinish}
            className="mt-5 w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white"
          >
            {m.finish}
          </button>
        </div>
      )}
    </div>
  )
}


