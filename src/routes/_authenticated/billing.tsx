import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import {
  getMySubscriptionStatus,
  getBaridiMobPaymentInfo,
  requestBillingProofUploadUrl,
  submitBillingProof,
  listMyBillingProofs,
  type BillingProofRow,
} from '~/server/billing'
import { uploadToPresignedUrl } from '~/lib/upload'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd, formatDate } from '~/lib/i18n/format'
import type { MerchantDictionary } from '~/lib/i18n/translations'

export const Route = createFileRoute('/_authenticated/billing')({
  loader: async () => {
    const [status, paymentInfo, proofs] = await Promise.all([
      getMySubscriptionStatus(),
      getBaridiMobPaymentInfo(),
      listMyBillingProofs(),
    ])
    return { status, paymentInfo, proofs }
  },
  component: BillingPage,
})

function BillingPage() {
  const { status, paymentInfo, proofs } = Route.useLoaderData()
  const router = useRouter()
  const { locale, t, dir } = useLocale()
  const m = t.merchant

  const PROOF_STATUS_LABELS: Record<string, string> = {
    pending: m.proofPending,
    approved: m.proofApproved,
    rejected: m.proofRejected,
  }

  const expiresAt = new Date(status.currentPeriodExpiresAt)
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4 space-y-4" dir={dir}>
      <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{m.billingTitle}</h1>

      <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-1">{m.subscriptionStatus}</h2>
        {status.isExpired ? (
          <p className="text-sm text-[var(--color-danger)]">{m.expiredWarning}</p>
        ) : (
          <p className="text-sm text-[var(--color-text-primary)]">
            {m.activeUntil} {formatDate(expiresAt, locale)} ({daysRemaining} {m.daysRemaining})
          </p>
        )}
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {m.monthlyPrice} : {formatDzd(status.monthlyPriceCentimes, locale)}
        </p>
      </section>

      <BaridiMobSection rib={paymentInfo.rib} accountName={paymentInfo.accountName} m={m} />

      <SubmitProofSection
        amountCentimes={status.monthlyPriceCentimes}
        onSubmitted={() => router.invalidate({ sync: true })}
        m={m}
      />

      <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-3">{m.history}</h2>
        <div className="space-y-2">
          {proofs.map((proof: BillingProofRow) => (
            <div
              key={proof.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <div>
                <p className="text-[var(--color-text-primary)]">
                  {proof.transactionReference} · {formatDzd(proof.declaredAmountCentimes, locale)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatDate(proof.createdAt, locale)}
                  {proof.rejectionReason ? ` · ${proof.rejectionReason}` : ''}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  proof.status === 'approved'
                    ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                    : proof.status === 'rejected'
                      ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
                      : 'bg-[var(--color-accent)]/20 text-[var(--color-text-primary)]'
                }`}
              >
                {PROOF_STATUS_LABELS[proof.status]}
              </span>
            </div>
          ))}
          {proofs.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">{m.noSubmissions}</p>
          )}
        </div>
      </section>
    </div>
  )
}

function BaridiMobSection({
  rib,
  accountName,
  m,
}: {
  rib: string
  accountName: string
  m: MerchantDictionary
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(rib)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
      <h2 className="font-semibold text-[var(--color-text-primary)] mb-2">{m.payViaBaridiMob}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-3">{m.payInstructions}</p>

      <div className="rounded-lg bg-[var(--color-surface-muted)] p-3 mb-3">
        <p className="text-xs text-[var(--color-text-muted)]">{m.accountHolder}</p>
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-2">{accountName}</p>
        <p className="text-xs text-[var(--color-text-muted)]">RIB</p>
        <div className="flex items-center gap-2">
          <p className="text-sm font-mono text-[var(--color-text-primary)]">{rib}</p>
          <button
            onClick={handleCopy}
            className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs"
          >
            {copied ? m.copied : m.copy}
          </button>
        </div>
      </div>

      <ol className="list-decimal list-inside text-sm text-[var(--color-text-muted)] space-y-1">
        <li>{m.baridiMobStep1}</li>
        <li>{m.baridiMobStep2}</li>
        <li>{m.baridiMobStep3}</li>
        <li>{m.baridiMobStep4}</li>
      </ol>
    </section>
  )
}

function SubmitProofSection({
  amountCentimes,
  onSubmitted,
  m,
}: {
  amountCentimes: number
  onSubmitted: () => void
  m: MerchantDictionary
}) {
  const requestUpload = useServerFn(requestBillingProofUploadUrl)
  const submitProof = useServerFn(submitBillingProof)

  const [file, setFile] = useState<File | null>(null)
  const [reference, setReference] = useState('')
  const [amountDzd, setAmountDzd] = useState((amountCentimes / 100).toFixed(2))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!file) {
      setError(m.selectFileError)
      return
    }
    const declaredAmountCentimes = Math.round(parseFloat(amountDzd) * 100)
    if (!reference.trim() || Number.isNaN(declaredAmountCentimes)) {
      setError(m.fillReferenceAndAmount)
      return
    }

    setIsSubmitting(true)
    try {
      const presign = await requestUpload({
        data: { mimeType: file.type as 'image/jpeg' | 'image/png' | 'application/pdf', sizeBytes: file.size },
      })
      if (!presign.ok) {
        setError(presign.error)
        return
      }
      await uploadToPresignedUrl(presign.uploadUrl, file)
      await submitProof({
        data: {
          storageKey: presign.storageKey,
          transactionReference: reference.trim(),
          declaredAmountCentimes,
        },
      })
      setFile(null)
      setReference('')
      setSuccess(true)
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : m.submitFailed)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm">
      <h2 className="font-semibold text-[var(--color-text-primary)] mb-3">{m.submitReceipt}</h2>
      <form onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {m.receiptFile}
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-3 text-sm"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {m.transactionReference}
        </label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3 text-sm"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {m.amount}
        </label>
        <input
          type="number"
          step={0.01}
          value={amountDzd}
          onChange={(e) => setAmountDzd(e.target.value)}
          className="w-32 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3 text-sm"
        />

        {error && <p className="text-sm text-[var(--color-danger)] mb-2">{error}</p>}
        {success && <p className="text-sm text-[var(--color-success)] mb-2">{m.submitted}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? m.submitting : m.submit}
        </button>
      </form>
    </section>
  )
}
