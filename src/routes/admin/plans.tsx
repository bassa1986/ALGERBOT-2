import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import {
  listPlansForAdmin,
  upsertPlan,
  setPlanActive,
  listPlanChangeRequests,
  approvePlanChangeRequest,
  rejectPlanChangeRequest,
  type AdminPlanChangeRequestRow,
} from '~/server/plan-requests'
import type { PlanLimits } from '~/lib/plans'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd, formatDate } from '~/lib/i18n/format'

export const Route = createFileRoute('/admin/plans')({
  loader: async () => {
    const [plans, requests] = await Promise.all([
      listPlansForAdmin(),
      listPlanChangeRequests({ data: {} }),
    ])
    return { plans, requests }
  },
  component: AdminPlansPage,
})

function AdminPlansPage() {
  const { plans, requests } = Route.useLoaderData()
  const router = useRouter()
  const { locale, dir } = useLocale()
  const L = locale === 'ar'
    ? {
        title: 'الخطط والاشتراكات',
        dashboard: 'لوحة التحكم',
        plansSection: 'الخطط',
        addPlan: '+ خطة جديدة',
        requestsSection: 'طلبات تغيير الخطة',
        noRequests: 'لا توجد طلبات معلقة',
      }
    : {
        title: 'Forfaits et abonnements',
        dashboard: 'Tableau de bord',
        plansSection: 'Forfaits',
        addPlan: '+ Nouveau forfait',
        requestsSection: 'Demandes de changement de forfait',
        noRequests: 'Aucune demande en attente',
      }

  const [editingPlan, setEditingPlan] = useState<PlanLimits | 'new' | null>(null)

  function refresh() {
    return router.invalidate({ sync: true })
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{L.title}</h1>
        <Link to="/admin" className="text-sm text-[var(--color-text-muted)]">
          {L.dashboard}
        </Link>
      </div>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[var(--color-text-primary)]">{L.plansSection}</h2>
          <button
            onClick={() => setEditingPlan('new')}
            className="rounded-full bg-[var(--color-action-primary)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            {L.addPlan}
          </button>
        </div>

        <div className="space-y-2">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              locale={locale}
              onEdit={() => setEditingPlan(plan)}
              onToggled={refresh}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-3">{L.requestsSection}</h2>
        <div className="space-y-2">
          {requests.map((req) => (
            <PlanRequestRow key={req.id} request={req} locale={locale} onChanged={refresh} />
          ))}
          {requests.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">{L.noRequests}</p>
          )}
        </div>
      </section>

      {editingPlan !== null && (
        <PlanEditModal
          plan={editingPlan === 'new' ? null : editingPlan}
          existingPlanCount={plans.length}
          locale={locale}
          onClose={() => setEditingPlan(null)}
          onSaved={async () => {
            setEditingPlan(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function PlanRow({
  plan,
  locale,
  onEdit,
  onToggled,
}: {
  plan: PlanLimits
  locale: 'ar' | 'fr'
  onEdit: () => void
  onToggled: () => void
}) {
  const toggle = useServerFn(setPlanActive)
  const [isBusy, setIsBusy] = useState(false)
  const isActive = plan.isActive !== false

  async function handleToggle() {
    setIsBusy(true)
    try {
      await toggle({ data: { planId: plan.id, isActive: !isActive } })
      onToggled()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-3 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-[var(--color-text-primary)]">{plan.name}</p>
          {!isActive && (
            <span className="rounded-full bg-[var(--color-text-muted)]/15 text-[var(--color-text-muted)] text-xs px-2 py-0.5">
              {locale === 'ar' ? 'غير نشطة' : 'Inactif'}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {formatDzd(plan.monthlyPriceCentimes, locale)} ·{' '}
          {plan.maxProducts === null
            ? locale === 'ar' ? 'منتجات غير محدودة' : 'Produits illimités'
            : `${plan.maxProducts} ${locale === 'ar' ? 'منتج' : 'produits max'}`}
          {plan.storageLimitBytes !== null &&
            ` · ${(plan.storageLimitBytes / 1_073_741_824).toFixed(1)} GB`}
          {plan.trialDays > 0 && ` · ${plan.trialDays}j ${locale === 'ar' ? 'تجربة' : 'essai'}`}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onEdit}
          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs"
        >
          {locale === 'ar' ? 'تعديل' : 'Modifier'}
        </button>
        <button
          onClick={handleToggle}
          disabled={isBusy}
          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-50"
        >
          {isActive ? (locale === 'ar' ? 'تعطيل' : 'Désactiver') : (locale === 'ar' ? 'تفعيل' : 'Activer')}
        </button>
      </div>
    </div>
  )
}

function PlanRequestRow({
  request,
  locale,
  onChanged,
}: {
  request: AdminPlanChangeRequestRow
  locale: 'ar' | 'fr'
  onChanged: () => void
}) {
  const approve = useServerFn(approvePlanChangeRequest)
  const reject = useServerFn(rejectPlanChangeRequest)
  const [isBusy, setIsBusy] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setError(null)
    setIsBusy(true)
    try {
      await approve({ data: { requestId: request.id } })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      setError(locale === 'ar' ? 'مطلوب سبب' : 'Un motif est requis')
      return
    }
    setError(null)
    setIsBusy(true)
    try {
      await reject({ data: { requestId: request.id, reason: rejectReason.trim() } })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="rounded-xl bg-[var(--color-surface)] p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[var(--color-text-primary)] truncate">
            {request.merchantName ?? request.telegramUsername ?? '—'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {request.currentPlanName} → {request.requestedPlanName} · {formatDate(request.createdAt, locale)}
          </p>
          {request.merchantNote && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1 italic">"{request.merchantNote}"</p>
          )}
        </div>
      </div>

      {request.status === 'pending' && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleApprove}
            disabled={isBusy}
            className="rounded-full bg-[var(--color-success)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {locale === 'ar' ? 'موافقة' : 'Approuver'}
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={isBusy}
            className="rounded-full bg-[var(--color-danger)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {locale === 'ar' ? 'رفض' : 'Rejeter'}
          </button>
        </div>
      )}

      {showRejectForm && (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] p-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={locale === 'ar' ? 'السبب' : 'Motif'}
            className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm mb-2"
          />
          <button
            onClick={handleReject}
            disabled={isBusy}
            className="rounded-full bg-[var(--color-danger)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {locale === 'ar' ? 'تأكيد الرفض' : 'Confirmer le rejet'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[var(--color-danger)] mt-1">{error}</p>}
    </div>
  )
}

function PlanEditModal({
  plan,
  existingPlanCount,
  locale,
  onClose,
  onSaved,
}: {
  plan: PlanLimits | null
  existingPlanCount: number
  locale: 'ar' | 'fr'
  onClose: () => void
  onSaved: () => void
}) {
  const save = useServerFn(upsertPlan)
  const isNew = plan === null

  const [id, setId] = useState(plan?.id ?? '')
  const [name, setName] = useState(plan?.name ?? '')
  const [priceDzd, setPriceDzd] = useState(((plan?.monthlyPriceCentimes ?? 0) / 100).toFixed(2))
  const [maxProducts, setMaxProducts] = useState(plan?.maxProducts?.toString() ?? '')
  const [maxImages, setMaxImages] = useState(plan?.maxImagesPerProduct?.toString() ?? '6')
  const [storageGb, setStorageGb] = useState(
    plan?.storageLimitBytes ? (plan.storageLimitBytes / 1_073_741_824).toString() : '',
  )
  const [trialDays, setTrialDays] = useState(plan?.trialDays?.toString() ?? '0')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    const monthlyPriceCentimes = Math.round(parseFloat(priceDzd) * 100)
    if (!id.trim() || !name.trim() || Number.isNaN(monthlyPriceCentimes)) {
      setError(locale === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Veuillez remplir tous les champs requis')
      return
    }
    setIsSaving(true)
    try {
      await save({
        data: {
          id: id.trim(),
          name: name.trim(),
          monthlyPriceCentimes,
          maxProducts: maxProducts.trim() ? parseInt(maxProducts, 10) : null,
          maxImagesPerProduct: parseInt(maxImages, 10) || 6,
          storageLimitBytes: storageGb.trim() ? Math.round(parseFloat(storageGb) * 1_073_741_824) : null,
          trialDays: parseInt(trialDays, 10) || 0,
          isActive: true,
          sortOrder: isNew ? existingPlanCount + 1 : 0,
        },
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--color-surface)] rounded-2xl p-5 w-full max-w-sm shadow-lg">
        <h3 className="font-bold text-[var(--color-text-primary)] mb-3">
          {isNew ? (locale === 'ar' ? 'خطة جديدة' : 'Nouveau forfait') : (locale === 'ar' ? 'تعديل الخطة' : 'Modifier le forfait')}
        </h3>

        <div className="space-y-2">
          <Field label={locale === 'ar' ? 'المعرف (id)' : 'Identifiant (id)'}>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={!isNew}
              placeholder="starter"
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm disabled:opacity-60"
            />
          </Field>
          <Field label={locale === 'ar' ? 'الاسم' : 'Nom'}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label={locale === 'ar' ? 'السعر الشهري (دج)' : 'Prix mensuel (DZD)'}>
            <input
              type="number"
              step={0.01}
              value={priceDzd}
              onChange={(e) => setPriceDzd(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label={locale === 'ar' ? 'أقصى عدد منتجات (فارغ = غير محدود)' : 'Produits max (vide = illimité)'}>
            <input
              type="number"
              value={maxProducts}
              onChange={(e) => setMaxProducts(e.target.value)}
              placeholder={locale === 'ar' ? 'غير محدود' : 'Illimité'}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label={locale === 'ar' ? 'أقصى صور لكل منتج' : "Images max par produit"}>
            <input
              type="number"
              value={maxImages}
              onChange={(e) => setMaxImages(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label={locale === 'ar' ? 'حد التخزين GB (فارغ = بدون حد)' : 'Quota stockage GB (vide = aucun)'}>
            <input
              type="number"
              step={0.1}
              value={storageGb}
              onChange={(e) => setStorageGb(e.target.value)}
              placeholder={locale === 'ar' ? 'بدون حد' : 'Aucun'}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label={locale === 'ar' ? 'أيام الفترة التجريبية' : "Jours d'essai gratuit"}>
            <input
              type="number"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)] mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            {locale === 'ar' ? 'إلغاء' : 'Annuler'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? '...' : locale === 'ar' ? 'حفظ' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">{label}</label>
      {children}
    </div>
  )
}
