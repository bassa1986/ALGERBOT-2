import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { downloadProductImportTemplate } from '~/server/product-import-template'
import { previewProductImport, confirmProductImport, type ParsedRow, type RowError } from '~/server/product-import'
import { downloadBase64File } from '~/lib/upload'
import { useLocale } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/_authenticated/products/import')({
  component: ImportPage,
})

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the "data:...;base64," prefix — server expects raw base64
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('Échec de la lecture du fichier'))
    reader.readAsDataURL(file)
  })
}

type PreviewState = {
  base64: string
  totalRows: number
  validCount: number
  errorCount: number
  errors: RowError[]
  previewRows: ParsedRow[]
} | null

function ImportPage() {
  const router = useRouter()
  const getTemplate = useServerFn(downloadProductImportTemplate)
  const preview = useServerFn(previewProductImport)
  const confirm = useServerFn(confirmProductImport)
  const { t, dir } = useLocale()
  const m = t.merchant

  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [previewState, setPreviewState] = useState<PreviewState>(null)
  const [confirmResult, setConfirmResult] = useState<{
    upsertedProducts: number
    upsertedVariants: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownloadTemplate() {
    setIsDownloadingTemplate(true)
    try {
      const { base64, filename } = await getTemplate()
      downloadBase64File(base64, filename)
    } finally {
      setIsDownloadingTemplate(false)
    }
  }

  async function handleFileSelected(file: File) {
    setError(null)
    setConfirmResult(null)
    setIsParsing(true)
    try {
      const base64 = await fileToBase64(file)
      const result = await preview({ data: { base64 } })
      setPreviewState({ base64, ...result })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la lecture du fichier')
    } finally {
      setIsParsing(false)
    }
  }

  async function handleConfirm() {
    if (!previewState) return
    setError(null)
    setIsConfirming(true)
    try {
      const result = await confirm({ data: { base64: previewState.base64 } })
      if (!result.ok) {
        setError("L'import a échoué : aucune ligne valide")
        return
      }
      setConfirmResult({
        upsertedProducts: result.upsertedProducts,
        upsertedVariants: result.upsertedVariants,
      })
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'import")
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
          {m.importExcel}
        </h1>
        <Link to="/products" className="text-sm text-[var(--color-text-muted)] underline">
          {m.productsTitle}
        </Link>
      </header>

      <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-2xl mb-4">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-2">1. Télécharger le modèle</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-3">
          Remplissez le fichier avec vos produits, puis importez-le ci-dessous. Une ligne par
          variante ; laissez la colonne variante vide pour un produit sans variantes.
        </p>
        <button
          onClick={handleDownloadTemplate}
          disabled={isDownloadingTemplate}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] disabled:opacity-50"
        >
          {isDownloadingTemplate ? 'Téléchargement...' : 'Télécharger le modèle .xlsx'}
        </button>
      </section>

      <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-2xl mb-4">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-2">2. Importer le fichier rempli</h2>
        <label className="inline-block rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold cursor-pointer">
          {isParsing ? 'Analyse...' : 'Choisir un fichier .xlsx'}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            disabled={isParsing}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelected(file)
              e.target.value = ''
            }}
          />
        </label>
        {error && <p className="text-sm text-[var(--color-danger)] mt-3">{error}</p>}
      </section>

      {previewState && (
        <section className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-sm max-w-2xl">
          <h2 className="font-semibold text-[var(--color-text-primary)] mb-2">3. Aperçu et confirmation</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            {previewState.validCount} ligne(s) valide(s) sur {previewState.totalRows}
            {previewState.errorCount > 0 && ` · ${previewState.errorCount} erreur(s)`}
          </p>

          {previewState.errors.length > 0 && (
            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg bg-[var(--color-danger)]/10 p-3">
              {previewState.errors.map((e, i) => (
                <p key={i} className="text-xs text-[var(--color-danger)]">
                  Ligne {e.rowNumber} : {e.message}
                </p>
              ))}
            </div>
          )}

          {previewState.previewRows.length > 0 && (
            <div className="mb-4 max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-start text-[var(--color-text-muted)]">
                    <th className="p-1">Ligne</th>
                    <th className="p-1">SKU</th>
                    <th className="p-1">Nom</th>
                    <th className="p-1">Prix</th>
                    <th className="p-1">Variante</th>
                    <th className="p-1">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {previewState.previewRows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.variantLabel}`} className="border-t border-[var(--color-border)]">
                      <td className="p-1">{row.rowNumber}</td>
                      <td className="p-1">{row.sku}</td>
                      <td className="p-1">{row.name}</td>
                      <td className="p-1">{(row.priceCentimes / 100).toFixed(2)}</td>
                      <td className="p-1">{row.variantLabel || '—'}</td>
                      <td className="p-1">{row.variantStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {confirmResult ? (
            <p className="text-sm text-[var(--color-success)]">
              Import terminé : {confirmResult.upsertedProducts} produit(s), {confirmResult.upsertedVariants} variante(s).
            </p>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={isConfirming || previewState.validCount === 0}
              className="rounded-full bg-[var(--color-action-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isConfirming ? 'Import en cours...' : `Confirmer l'import (${previewState.validCount} lignes)`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
