import type { PublicCategory } from '~/server/storefront-public'
import type { StoreLayoutVariant } from '~/server/store'
import { useLocale } from '~/lib/i18n/LocaleContext'

// A small, generic icon set keyed by category slug fragments — good enough
// to give the grocery icon bar visual variety without depending on any
// per-category icon data the schema doesn't have. Falls back to a bullet.
const ICON_BY_KEYWORD: [string, string][] = [
  ['epicerie', '🛒'],
  ['fruit', '🍎'],
  ['legume', '🥦'],
  ['boisson', '🥤'],
  ['vetement', '👕'],
  ['chaussure', '👟'],
  ['electron', '🔌'],
  ['telephone', '📱'],
  ['maison', '🏠'],
  ['meuble', '🛋️'],
  ['sport', '⚽'],
  ['bebe', '🍼'],
  ['bijou', '💍'],
  ['sac', '👜'],
  ['jouet', '🧸'],
  ['livre', '📚'],
  ['beaute', '💄'],
]

function iconFor(slug: string): string {
  const match = ICON_BY_KEYWORD.find(([kw]) => slug.includes(kw))
  return match?.[1] ?? '🏷️'
}

export function CategoryNav({
  categories,
  variant,
  selectedSlug,
  onSelect,
}: {
  categories: PublicCategory[]
  variant: StoreLayoutVariant
  selectedSlug: string | undefined
  onSelect: (slug: string | undefined) => void
}) {
  const { locale, t } = useLocale()

  if (categories.length === 0) return null

  if (variant === 'grocery') {
    // Icon bar: horizontal scroll of icon + short label, grocery's
    // signature "browse by department" pattern.
    return (
      <div className="flex gap-3 overflow-x-auto px-4 py-3 -mx-4">
        <button
          onClick={() => onSelect(undefined)}
          className={`flex flex-col items-center gap-1 shrink-0 ${
            !selectedSlug ? 'text-[var(--color-action-primary)]' : 'text-[var(--color-text-muted)]'
          }`}
        >
          <span className="h-12 w-12 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-xl shadow-sm">
            ✨
          </span>
          <span className="text-[10px] font-medium">{t.categoriesAll}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            onClick={() => onSelect(c.slug)}
            className={`flex flex-col items-center gap-1 shrink-0 ${
              selectedSlug === c.slug ? 'text-[var(--color-action-primary)]' : 'text-[var(--color-text-muted)]'
            }`}
          >
            <span
              className={`h-12 w-12 rounded-full flex items-center justify-center text-xl shadow-sm ${
                selectedSlug === c.slug ? 'bg-[var(--color-action-primary)]/15' : 'bg-[var(--color-surface)]'
              }`}
            >
              {iconFor(c.slug)}
            </span>
            <span className="text-[10px] font-medium truncate max-w-[60px]">
              {locale === 'ar' ? c.nameAr : c.nameFr}
            </span>
          </button>
        ))}
      </div>
    )
  }

  // Default: filter chips, used by general/fashion/electronics/furniture.
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 -mx-4">
      <button
        onClick={() => onSelect(undefined)}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
          !selectedSlug
            ? 'bg-[var(--color-action-primary)] text-white'
            : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
        }`}
      >
        {t.categoriesAll}
      </button>
      {categories.map((c) => (
        <button
          key={c.slug}
          onClick={() => onSelect(c.slug)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
            selectedSlug === c.slug
              ? 'bg-[var(--color-action-primary)] text-white'
              : 'border border-[var(--color-border)] text-[var(--color-text-primary)]'
          }`}
        >
          {locale === 'ar' ? c.nameAr : c.nameFr}
        </button>
      ))}
    </div>
  )
}


