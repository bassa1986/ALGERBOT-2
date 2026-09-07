import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  getMyStore,
  updateMyStore,
  getMyDeliveryZones,
  setMyDeliveryZones,
} from '~/server/store'
import { getCurrentMerchant, updateMyWhatsAppNumber, updateMyPhoneVisibility } from '~/server/auth'
import { requestStoreImageUpload } from '~/server/storage'
import { getWilayas, getCommunesByWilaya, type CommuneRow } from '~/server/wilayas'
import { uploadToPresignedUrl, resizeImageToJpeg } from '~/lib/upload'
import { useLocale } from '~/lib/i18n/LocaleContext'
import type { MerchantDictionary } from '~/lib/i18n/translations'
import { THEME_PRESETS } from '~/lib/store-themes'

export const Route = createFileRoute('/_authenticated/store-settings')({
  loader: async () => {
    const [store, zones, wilayas, merchant] = await Promise.all([
      getMyStore(),
      getMyDeliveryZones(),
      getWilayas(),
      getCurrentMerchant(),
    ])
    return { store, zones, wilayas, merchant }
  },
  component: StoreSettingsPage,
})

function StoreSettingsPage() {
  const { store, zones, wilayas, merchant } = Route.useLoaderData()
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

      <StoreProfileSection store={store} wilayas={wilayas} m={t.merchant} />
      <AppearanceSection store={store} m={t.merchant} />
      <WhatsAppContactSection merchant={merchant} m={t.merchant} />
      <PhoneVisibilitySection merchant={merchant} m={t.merchant} />
      <DeliveryZonesSection storeId={store.id} zones={zones} wilayas={wilayas} m={t.merchant} />
    </div>
  )
}

// ---------- WhatsApp contact number (separate from the store profile —
// this lives on the merchant's own account, not the store row) ----------

function WhatsAppContactSection({
  merchant,
  m,
}: {
  merchant: Awaited<ReturnType<typeof getCurrentMerchant>>
  m: MerchantDictionary
}) {
  const updateWhatsApp = useServerFn(updateMyWhatsAppNumber)
  const [whatsappNumber, setWhatsappNumber] = useState(merchant?.whatsappNumber ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setError(null)
    setSaved(false)
    setIsSaving(true)
    try {
      await updateWhatsApp({ data: { whatsappNumber } })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
      <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{m.whatsappContact}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">{m.whatsappContactHint}</p>

      <input
        type="tel"
        value={whatsappNumber}
        onChange={(e) => setWhatsappNumber(e.target.value)}
        placeholder={m.whatsappPlaceholder}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
      />

      {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}
      {saved && !error && <p className="text-sm text-[var(--color-success)] mb-3">{m.saved}</p>}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isSaving ? m.saving : m.save}
      </button>
    </div>
  )
}

// ---------- Phone number + explicit storefront-visibility opt-in ----------
//
// Deliberately a single combined decision, not two separate toggles: a
// merchant enters their number AND decides in the same action whether
// buyers can see it. Having a phone on file never implies visibility on
// its own — the checkbox below is the only thing that can turn it on, and
// it's force-unchecked (and disabled) whenever the field is empty, so
// "visible with no number" is never a reachable state from this UI. The
// server enforces the same rule independently either way (see
// updateMyPhoneVisibility in src/server/auth.ts).
// ---------- Storefront appearance (curated color theme) ----------
//
// A merchant picks one of a small set of pre-made color themes for their
// own store (see THEME_PRESETS in src/lib/store-themes.ts) — never a
// free-form color picker, so every combination stays legible. The chosen
// theme only affects THIS merchant's own storefront pages (see
// StorefrontThemeProvider), never the marketplace homepage or any other
// store.
function AppearanceSection({ store, m }: { store: NonNullable<Awaited<ReturnType<typeof getMyStore>>>; m: MerchantDictionary }) {
  const updateStore = useServerFn(updateMyStore)
  const [themeId, setThemeId] = useState(store.themeId ?? 'default')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { locale } = useLocale()

  async function handleSelect(newThemeId: string) {
    setThemeId(newThemeId)
    setError(null)
    setSaved(false)
    setIsSaving(true)
    try {
      await updateStore({ data: { themeId: newThemeId } })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
      <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{m.storeAppearance}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">{m.storeAppearanceHint}</p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {THEME_PRESETS.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => handleSelect(theme.id)}
            disabled={isSaving}
            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 disabled:opacity-50 ${
              themeId === theme.id ? 'border-[var(--color-text-primary)]' : 'border-transparent'
            }`}
          >
            <span className="flex h-8 w-8 overflow-hidden rounded-full border border-[var(--color-border)]">
              <span className="h-full w-1/2" style={{ backgroundColor: theme.actionPrimary }} />
              <span className="h-full w-1/2" style={{ backgroundColor: theme.accent }} />
            </span>
            <span className="text-[10px] font-medium text-[var(--color-text-primary)] text-center leading-tight">
              {locale === 'ar' ? theme.labelAr : theme.labelFr}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)] mb-1">{error}</p>}
      {saved && !error && !isSaving && <p className="text-sm text-[var(--color-success)]">{m.saved}</p>}
    </div>
  )
}

function PhoneVisibilitySection({
  merchant,
  m,
}: {
  merchant: Awaited<ReturnType<typeof getCurrentMerchant>>
  m: MerchantDictionary
}) {
  const updatePhone = useServerFn(updateMyPhoneVisibility)
  const [phone, setPhone] = useState(merchant?.phone ?? '')
  const [visible, setVisible] = useState(merchant?.phoneVisibleInStorefront ?? false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setError(null)
    setSaved(false)
    setIsSaving(true)
    try {
      const result = await updatePhone({ data: { phone, visible: phone.trim() !== '' && visible } })
      setVisible(result.visible)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
      <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{m.phoneContact}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">{m.phoneContactHint}</p>

      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={m.phonePlaceholder}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
      />

      <label className="flex items-center gap-2 mb-3">
        <input
          type="checkbox"
          checked={visible && phone.trim() !== ''}
          disabled={phone.trim() === ''}
          onChange={(e) => setVisible(e.target.checked)}
        />
        <span className="text-sm text-[var(--color-text-primary)]">{m.phoneVisibleToggle}</span>
      </label>

      {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}
      {saved && !error && <p className="text-sm text-[var(--color-success)] mb-3">{m.saved}</p>}

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isSaving ? m.saving : m.save}
      </button>
    </div>
  )
}

// ---------- Profile: name, description, logo, banner, publish toggle ----------

function StoreProfileSection({
  store,
  wilayas,
  m,
}: {
  store: NonNullable<Awaited<ReturnType<typeof getMyStore>>>
  wilayas: { code: number; nameAr: string; nameFr: string }[]
  m: MerchantDictionary
}) {
  const updateStore = useServerFn(updateMyStore)
  const requestUpload = useServerFn(requestStoreImageUpload)
  const fetchCommunes = useServerFn(getCommunesByWilaya)
  const { locale } = useLocale()

  const [name, setName] = useState(store.name)
  const [description, setDescription] = useState(store.description ?? '')
  const [logoUrl, setLogoUrl] = useState(store.logoUrl)
  const [bannerUrl, setBannerUrl] = useState(store.bannerUrl)
  const [baseWilayaCode, setBaseWilayaCode] = useState<number | null>(store.baseWilayaCode)
  const [baseCommuneCode, setBaseCommuneCode] = useState<number | null>(store.baseCommuneCode)
  const [googleMapsUrl, setGoogleMapsUrl] = useState(store.googleMapsUrl ?? '')
  const [communes, setCommunes] = useState<CommuneRow[]>([])
  const [isLoadingCommunes, setIsLoadingCommunes] = useState(false)
  const [isPublished, setIsPublished] = useState(store.isPublished)
  const [layoutVariant, setLayoutVariant] = useState(store.layoutVariant)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reload the commune list whenever the selected wilaya changes — a
  // commune's code is only meaningful within its own wilaya. On the very
  // first load this also validates the store's saved commune still
  // belongs to its saved wilaya; if not (stale data), it's cleared rather
  // than silently kept.
  useEffect(() => {
    if (baseWilayaCode === null) {
      setCommunes([])
      setBaseCommuneCode(null)
      return
    }
    let cancelled = false
    setIsLoadingCommunes(true)
    fetchCommunes({ data: { wilayaCode: baseWilayaCode } })
      .then((rows) => {
        if (cancelled) return
        setCommunes(rows)
        setBaseCommuneCode((current) => (current !== null && rows.some((r) => r.code === current) ? current : null))
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCommunes(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-runs only on wilaya change
  }, [baseWilayaCode, fetchCommunes])

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
    if (isPublished && (baseWilayaCode === null || baseCommuneCode === null)) {
      setError(m.wilayaRequiredToPublish)
      return
    }
    setIsSaving(true)
    try {
      await updateStore({
        data: {
          name,
          description: description || null,
          logoUrl,
          bannerUrl,
          baseWilayaCode,
          baseCommuneCode,
          googleMapsUrl: googleMapsUrl || null,
          isPublished,
          layoutVariant,
        },
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
        {m.storeWilaya}
      </label>
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{m.storeWilayaHint}</p>
      {wilayas.length === 0 ? (
        <p className="mb-4 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          {m.wilayaListUnavailable}
        </p>
      ) : (
        <select
          value={baseWilayaCode ?? ''}
          onChange={(e) => setBaseWilayaCode(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        >
          <option value="">{m.storeWilayaPlaceholder}</option>
          {wilayas.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code.toString().padStart(2, '0')} — {locale === 'ar' ? w.nameAr : w.nameFr}
            </option>
          ))}
        </select>
      )}

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {m.storeCommune}
      </label>
      <select
        value={baseCommuneCode ?? ''}
        onChange={(e) => setBaseCommuneCode(e.target.value ? Number(e.target.value) : null)}
        disabled={baseWilayaCode === null || isLoadingCommunes}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4 disabled:opacity-50"
      >
        <option value="">
          {baseWilayaCode === null
            ? m.storeCommunePlaceholderNoWilaya
            : isLoadingCommunes
              ? m.loading
              : m.storeCommunePlaceholder}
        </option>
        {communes.map((c) => (
          <option key={c.code} value={c.code}>
            {locale === 'ar' ? c.nameAr : c.nameFr}
          </option>
        ))}
      </select>

      <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
        {m.storeGoogleMapsUrl}
      </label>
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{m.storeGoogleMapsUrlHint}</p>
      <input
        type="url"
        value={googleMapsUrl}
        onChange={(e) => setGoogleMapsUrl(e.target.value)}
        placeholder="https://maps.app.goo.gl/..."
        dir="ltr"
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

      <label className="flex items-center gap-2 mb-1">
        <input
          type="checkbox"
          checked={isPublished}
          disabled={baseWilayaCode === null || baseCommuneCode === null}
          onChange={(e) => setIsPublished(e.target.checked)}
        />
        <span className="text-sm text-[var(--color-text-primary)]">
          {m.storePublished}
        </span>
      </label>
      {(baseWilayaCode === null || baseCommuneCode === null) && (
        <p className="text-xs text-[var(--color-danger)] mb-4">{m.wilayaRequiredToPublish}</p>
      )}

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
        {wilayas.length === 0 && (
          <p className="py-4 text-center text-xs text-[var(--color-danger)]">{m.wilayaListUnavailable}</p>
        )}
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


