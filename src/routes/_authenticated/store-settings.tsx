import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  getMyStore,
  updateMyStore,
  getMyDeliveryZones,
  setMyDeliveryZones,
} from '~/server/store'
import { requestStoreImageUpload } from '~/server/storage'
import { getWilayas } from '~/server/wilayas'
import { uploadToPresignedUrl, resizeImageToJpeg } from '~/lib/upload'
import { useLocale } from '~/lib/i18n/LocaleContext'
import type { MerchantDictionary } from '~/lib/i18n/translations'

export const Route = createFileRoute('/_authenticated/store-settings')({
  loader: async () => {
    const [store, zones, wilayas] = await Promise.all([
      getMyStore(),
      getMyDeliveryZones(),
      getWilayas(),
    ])
    return { store, zones, wilayas }
  },
  component: StoreSettingsPage,
})

function StoreSettingsPage() {
  const { store, zones, wilayas } = Route.useLoaderData()
  const { t, dir } = useLocale()

  if (!store) {
    // Guarded in practice by the dashboard/onboarding redirect flow, but
    // guard here too since this route can be navigated to directly.
    return (
      <div className="p-4 text-[var(--color-text-primary)]" dir={dir}>
        {t.merchant.createFirstStore}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4 space-y-6" dir={dir}>
      <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
        {t.merchant.storeSettingsTitle}
      </h1>

      <StoreProfileSection store={store} m={t.merchant} />
      <DeliveryZonesSection storeId={store.id} zones={zones} wilayas={wilayas} m={t.merchant} />
    </div>
  )
}

// ---------- Profile: name, description, logo, banner, publish toggle ----------

function StoreProfileSection({
  store,
  m,
}: {
  store: NonNullable<Awaited<ReturnType<typeof getMyStore>>>
  m: MerchantDictionary
}) {
  const updateStore = useServerFn(updateMyStore)
  const requestUpload = useServerFn(requestStoreImageUpload)

  const [name, setName] = useState(store.name)
  const [description, setDescription] = useState(store.description ?? '')
  const [logoUrl, setLogoUrl] = useState(store.logoUrl)
  const [bannerUrl, setBannerUrl] = useState(store.bannerUrl)
  const [isPublished, setIsPublished] = useState(store.isPublished)
  const [layoutVariant, setLayoutVariant] = useState(store.layoutVariant)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleImageUpload(kind: 'logo' | 'banner', file: File) {
    setError(null)
    kind === 'logo' ? setIsUploadingLogo(true) : setIsUploadingBanner(true)
    try {
      const resized = await resizeImageToJpeg(file, kind === 'logo' ? 800 : 1600)
      const presign = await requestUpload({
        data: { kind, mimeType: 'image/jpeg', sizeBytes: resized.size },
      })
      if (!presign.ok) {
        setError(presign.error)
        return
      }
      await uploadToPresignedUrl(presign.uploadUrl, resized)
      if (kind === 'logo') setLogoUrl(presign.publicUrl)
      else setBannerUrl(presign.publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement')
    } finally {
      kind === 'logo' ? setIsUploadingLogo(false) : setIsUploadingBanner(false)
    }
  }

  async function handleSave() {
    setError(null)
    setIsSaving(true)
    try {
      await updateStore({
        data: { name, description: description || null, logoUrl, bannerUrl, isPublished, layoutVariant },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
      <h2 className="font-semibold text-[var(--color-text-primary)] mb-4">{m.profile}</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <ImageUploadTile
          label={m.logo}
          imageUrl={logoUrl}
          isUploading={isUploadingLogo}
          uploadingLabel={m.uploading}
          chooseLabel={m.chooseImage}
          onFileSelected={(file) => handleImageUpload('logo', file)}
        />
        <ImageUploadTile
          label={m.banner}
          imageUrl={bannerUrl}
          isUploading={isUploadingBanner}
          uploadingLabel={m.uploading}
          chooseLabel={m.chooseImage}
          onFileSelected={(file) => handleImageUpload('banner', file)}
        />
      </div>

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {m.name}
      </label>
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
        {m.layoutVariant}
      </label>
      <select
        value={layoutVariant}
        onChange={(e) => setLayoutVariant(e.target.value as typeof layoutVariant)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
      >
        <option value="general">{m.layoutGeneral}</option>
        <option value="fashion">{m.layoutFashion}</option>
        <option value="grocery">{m.layoutGrocery}</option>
        <option value="electronics">{m.layoutElectronics}</option>
        <option value="furniture">{m.layoutFurniture}</option>
      </select>

      <label className="flex items-center gap-2 mb-4">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
        />
        <span className="text-sm text-[var(--color-text-primary)]">
          {m.storePublished}
        </span>
      </label>

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

function ImageUploadTile({
  label,
  imageUrl,
  isUploading,
  uploadingLabel,
  chooseLabel,
  onFileSelected,
}: {
  label: string
  imageUrl: string | null
  isUploading: boolean
  uploadingLabel: string
  chooseLabel: string
  onFileSelected: (file: File) => void
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {label}
      </span>
      <label className="flex aspect-video cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-border)] bg-white overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">
            {isUploading ? uploadingLabel : chooseLabel}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={isUploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFileSelected(file)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}

// ---------- Delivery zones ----------

function DeliveryZonesSection({
  zones: initialZones,
  wilayas,
  m,
}: {
  storeId: string
  zones: { wilayaCode: number; feeCentimes: number }[]
  wilayas: { code: number; nameAr: string; nameFr: string }[]
  m: MerchantDictionary
}) {
  const setZones = useServerFn(setMyDeliveryZones)
  const { locale } = useLocale()

  // Map of wilayaCode -> fee in DZD (display unit) for editable rows; a
  // wilaya not present in this map means "not delivered there".
  const initialMap = new Map(initialZones.map((z) => [z.wilayaCode, z.feeCentimes / 100]))
  const [enabled, setEnabled] = useState<Set<number>>(new Set(initialZones.map((z) => z.wilayaCode)))
  const [fees, setFees] = useState<Map<number, number>>(initialMap)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState(false)

  function toggle(code: number) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function setFee(code: number, dzd: number) {
    setFees((prev) => new Map(prev).set(code, dzd))
  }

  async function handleSave() {
    setError(null)
    setSavedMessage(false)
    setIsSaving(true)
    try {
      const zonesPayload = Array.from(enabled).map((code) => ({
        wilayaCode: code,
        feeCentimes: Math.round((fees.get(code) ?? 0) * 100),
      }))
      await setZones({ data: { zones: zonesPayload } })
      setSavedMessage(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
      <h2 className="font-semibold text-[var(--color-text-primary)] mb-1">
        {m.deliveryZones}
      </h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        {m.deliveryZonesSubtitle}
      </p>

      <div className="max-h-96 overflow-y-auto divide-y divide-[var(--color-border)]">
        {wilayas.map((w) => (
          <div key={w.code} className="flex items-center gap-3 py-2">
            <input
              type="checkbox"
              checked={enabled.has(w.code)}
              onChange={() => toggle(w.code)}
            />
            <span className="flex-1 text-sm text-[var(--color-text-primary)]">
              {w.code.toString().padStart(2, '0')} — {locale === 'ar' ? w.nameAr : w.nameFr}
            </span>
            {enabled.has(w.code) && (
              <input
                type="number"
                min={0}
                step={50}
                value={fees.get(w.code) ?? 0}
                onChange={(e) => setFee(w.code, Number(e.target.value))}
                className="w-24 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm text-end"
                placeholder="DZD"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)] mt-3">{error}</p>}
      {savedMessage && (
        <p className="text-sm text-[var(--color-success)] mt-3">{m.saved}</p>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="mt-4 rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isSaving ? m.saving : m.saveDeliveryFees}
      </button>
    </section>
  )
}
