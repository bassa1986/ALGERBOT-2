import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import {
  listBillingQueue,
  getBillingProofViewUrl,
  approveBillingProof,
  rejectBillingProof,
  type AdminBillingProofRow,
} from '~/server/billing'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import type { AdminDictionary } from '~/lib/i18n/translations'

export const Route = createFileRoute('/admin/billing')({
  loader: async () => {
    const proofs = await listBillingQueue({ data: {} })
    return { proofs }
  },
  component: AdminBillingPage,
})

function AdminBillingPage() {
  const { proofs } = Route.useLoaderData()
  const router = useRouter()
  const { t, dir } = useLocale()
  const a = t.admin

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{a.queueTitle}</h1>
        <Link to="/admin" className="text-sm text-[var(--color-text-muted)]">
          {a.dashboard}
        </Link>
      </div>

      <div className="space-y-2">
        {proofs.map((proof: AdminBillingProofRow) => (
          <BillingProofRow key={proof.id} proof={proof} onChanged={() => router.invalidate({ sync: true })} a={a} />
        ))}
        {proofs.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{a.noPendingProofs}</p>
        )}
      </div>
    </div>
  )
}

function BillingProofRow({
  proof,
  onChanged,
  a,
}: {
  proof: AdminBillingProofRow
  onChanged: () => void
  a: AdminDictionary
}) {
  const getViewUrl = useServerFn(getBillingProofViewUrl)
  const approve = useServerFn(approveBillingProof)
  const reject = useServerFn(rejectBillingProof)
  const { locale } = useLocale()

  const [isBusy, setIsBusy] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleView() {
    const { url } = await getViewUrl({ data: { proofId: proof.id } })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleApprove() {
    setError(null)
    setIsBusy(true)
    try {
      await approve({ data: { proofId: proof.id } })
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
      await reject({ data: { proofId: proof.id, reason: rejectReason.trim() } })
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
            {proof.merchantName ?? proof.telegramUsername ?? '—'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {proof.transactionReference} · {formatDzd(proof.declaredAmountCentimes, locale)}
          </p>
        </div>
        <button
          onClick={handleView}
          className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs"
        >
          {a.viewReceipt}
        </button>
      </div>

      {proof.status === 'pending' && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleApprove}
            disabled={isBusy}
            className="rounded-full bg-[var(--color-success)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {a.approve}
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            disabled={isBusy}
            className="rounded-full bg-[var(--color-danger)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {a.reject}
          </button>
        </div>
      )}

      {showRejectForm && (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] p-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={a.rejectReason}
            className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm mb-2"
          />
          <button
            onClick={handleReject}
            disabled={isBusy}
            className="rounded-full bg-[var(--color-danger)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {a.confirmReject}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[var(--color-danger)] mt-1">{error}</p>}
    </div>
  )
}
