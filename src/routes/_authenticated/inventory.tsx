import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { listMyInventory, adjustMyInventory, type InventoryRow } from '~/server/inventory'
import { exportMyInventory } from '~/server/export'
import { downloadBase64File } from '~/lib/upload'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { z } from 'zod'

const searchSchema = z.object({
  lowStockOnly: z.boolean().optional(),
})

export const Route = createFileRoute('/_authenticated/inventory')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ lowStockOnly: search.lowStockOnly }),
  loader: async ({ deps }) => {
    const rows = await listMyInventory({ data: { lowStockOnly: deps.lowStockOnly } })
    return { rows }
  },
  component: InventoryPage,
})

function InventoryPage() {
  const { rows } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const exportInventory = useServerFn(exportMyInventory)
  const [isExporting, setIsExporting] = useState(false)
  const { t, dir } = useLocale()
  const m = t.merchant

  const lowStockCount = rows.filter((r: InventoryRow) => r.isLowStock).length

  async function handleExport() {
    setIsExporting(true)
    try {
      const { base64, filename } = await exportInventory({
        data: { lowStockOnly: search.lowStockOnly },
      })
      downloadBase64File(base64, filename)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{m.inventoryTitle}</h1>
        <div className="flex items-center gap-2">
          {lowStockCount > 0 && (
            <span className="rounded-full bg-[var(--color-danger)]/15 px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">
              {lowStockCount} {m.lowStockAlert}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] disabled:opacity-50"
          >
            {isExporting ? m.exporting : m.exportExcel}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 mb-4 text-sm text-[var(--color-text-primary)]">
        <input
          type="checkbox"
          checked={search.lowStockOnly ?? false}
          onChange={(e) => navigate({ search: { lowStockOnly: e.target.checked || undefined } })}
        />
        {m.lowStockOnly}
      </label>

      <div className="space-y-2">
        {rows.map((row: InventoryRow) => (
          <InventoryRowItem
            key={row.variantId}
            row={row}
            onChanged={() => router.invalidate({ sync: true })}
            m={m}
          />
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{m.noItems}</p>
        )}
      </div>
    </div>
  )
}

function InventoryRowItem({
  row,
  onChanged,
  m,
}: {
  row: InventoryRow
  onChanged: () => void
  m: import('~/lib/i18n/translations').MerchantDictionary
}) {
  const adjust = useServerFn(adjustMyInventory)
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [adjustValue, setAdjustValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleAdjust(delta: number) {
    setError(null)
    setIsAdjusting(true)
    try {
      await adjust({ data: { variantId: row.variantId, delta } })
      setAdjustValue('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'ajustement")
    } finally {
      setIsAdjusting(false)
    }
  }

  return (
    <div
      className={`rounded-xl p-3 shadow-sm ${
        row.isLowStock ? 'bg-[var(--color-danger)]/10' : 'bg-[var(--color-surface)]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[var(--color-text-primary)] truncate">
            {row.productName} — {row.variantLabel}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            SKU {row.productSku} · {row.lowStockThreshold}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-sm font-semibold ${
              row.isLowStock ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]'
            }`}
          >
            {row.stockQuantity}
          </span>

          <input
            type="number"
            value={adjustValue}
            onChange={(e) => setAdjustValue(e.target.value)}
            placeholder="±"
            className="w-16 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-sm text-center"
          />
          <button
            onClick={() => handleAdjust(parseInt(adjustValue || '0', 10))}
            disabled={isAdjusting || !adjustValue}
            className="rounded-full bg-[var(--color-action-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {m.adjust}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)] mt-1">{error}</p>}
    </div>
  )
}


