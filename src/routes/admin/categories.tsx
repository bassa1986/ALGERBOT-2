import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { listAllCategories, createCategory, updateCategory, deleteCategory, type AdminCategoryRow } from '~/server/admin'
import { useLocale } from '~/lib/i18n/LocaleContext'

export const Route = createFileRoute('/admin/categories')({
  loader: async () => {
    const categories = await listAllCategories()
    return { categories }
  },
  component: AdminCategoriesPage,
})

function AdminCategoriesPage() {
  const { categories } = Route.useLoaderData()
  const router = useRouter()
  const create = useServerFn(createCategory)
  const remove = useServerFn(deleteCategory)
  const update = useServerFn(updateCategory)
  const { t, dir } = useLocale()
  const a = t.admin

  const [nameAr, setNameAr] = useState('')
  const [nameFr, setNameFr] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...categories].sort((x, y) => x.sortOrder - y.sortOrder)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nameAr.trim() || !nameFr.trim()) {
      setError(a.bothNamesRequired)
      return
    }
    setIsCreating(true)
    try {
      const maxSortOrder = sorted.length > 0 ? Math.max(...sorted.map((c) => c.sortOrder)) : -1
      await create({ data: { nameAr: nameAr.trim(), nameFr: nameFr.trim(), sortOrder: maxSortOrder + 1 } })
      setNameAr('')
      setNameFr('')
      await router.invalidate({ sync: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete(categoryId: string) {
    if (!window.confirm(a.confirmDeleteCategory)) return
    try {
      await remove({ data: { categoryId } })
      await router.invalidate({ sync: true })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Échec de la suppression')
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= sorted.length) return
    const current = sorted[index]
    const target = sorted[targetIndex]
    await update({ data: { categoryId: current.id, sortOrder: target.sortOrder } })
    await update({ data: { categoryId: target.id, sortOrder: current.sortOrder } })
    await router.invalidate({ sync: true })
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] p-4" dir={dir}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{a.categoriesTitle}</h1>
        <Link to="/admin" className="text-sm text-[var(--color-text-muted)]">
          {a.dashboard}
        </Link>
      </div>

      <form onSubmit={handleCreate} className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm mb-4 max-w-lg">
        <h2 className="font-semibold text-[var(--color-text-primary)] mb-2">{a.addCategory}</h2>
        <div className="flex flex-wrap gap-2 mb-2">
          <input
            type="text"
            value={nameFr}
            onChange={(e) => setNameFr(e.target.value)}
            placeholder={a.nameFrench}
            className="flex-1 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={a.nameArabic}
            dir="rtl"
            className="flex-1 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-xs text-[var(--color-danger)] mb-2">{error}</p>}
        <button
          type="submit"
          disabled={isCreating}
          className="rounded-full bg-[var(--color-action-primary)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {a.add}
        </button>
      </form>

      <div className="space-y-2 max-w-lg">
        {sorted.map((c, index) => (
          <CategoryRow
            key={c.id}
            category={c}
            isFirst={index === 0}
            isLast={index === sorted.length - 1}
            onMoveUp={() => handleMove(index, -1)}
            onMoveDown={() => handleMove(index, 1)}
            onDelete={() => handleDelete(c.id)}
            onSaved={() => router.invalidate({ sync: true })}
            a={a}
          />
        ))}
        {sorted.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{a.noCategories}</p>
        )}
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSaved,
  a,
}: {
  category: AdminCategoryRow
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onSaved: () => void
  a: import('~/lib/i18n/translations').AdminDictionary
}) {
  const update = useServerFn(updateCategory)
  const [isEditing, setIsEditing] = useState(false)
  const [nameFr, setNameFr] = useState(category.nameFr)
  const [nameAr, setNameAr] = useState(category.nameAr)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (!nameFr.trim() || !nameAr.trim()) {
      setError(a.bothNamesRequired)
      return
    }
    setIsSaving(true)
    try {
      await update({
        data: { categoryId: category.id, nameFr: nameFr.trim(), nameAr: nameAr.trim() },
      })
      setIsEditing(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement')
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    setNameFr(category.nameFr)
    setNameAr(category.nameAr)
    setError(null)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] p-3 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-2">
          <input
            type="text"
            value={nameFr}
            onChange={(e) => setNameFr(e.target.value)}
            placeholder={a.nameFrench}
            className="flex-1 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={a.nameArabic}
            dir="rtl"
            className="flex-1 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
          />
        </div>
        {error && <p className="text-xs text-[var(--color-danger)] mb-2">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-full bg-[var(--color-action-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? '...' : a.saveLabel}
          </button>
          <button onClick={handleCancel} className="text-xs text-[var(--color-text-muted)]">
            {a.cancelLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-xl bg-[var(--color-surface)] p-3 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="text-xs leading-none px-1 text-[var(--color-text-muted)] disabled:opacity-20"
            title={a.moveUp}
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="text-xs leading-none px-1 text-[var(--color-text-muted)] disabled:opacity-20"
            title={a.moveDown}
          >
            ▼
          </button>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{category.nameFr}</p>
          <p className="text-xs text-[var(--color-text-muted)] truncate" dir="rtl">{category.nameAr}</p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={() => setIsEditing(true)} title={a.saveLabel} className="text-xs text-[var(--color-text-primary)]">
          ✎
        </button>
        <button onClick={onDelete} title={a.confirmDeleteCategory} className="text-xs text-[var(--color-danger)]">
          🗑
        </button>
      </div>
    </div>
  )
}

