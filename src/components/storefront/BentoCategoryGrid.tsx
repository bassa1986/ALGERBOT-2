import type { PublicCategory } from '~/server/storefront-public'
import { useScrollReveal } from '~/lib/useScrollReveal'
import { useLocale } from '~/lib/i18n/LocaleContext'

/**
 * The 'general' variant's signature home-page element: an asymmetric bento
 * grid of category tiles (first tile large, rest smaller), used instead of
 * a plain list so the neutral variant still feels considered rather than
 * bare. Only used by the general layout — other variants use CategoryNav's
 * chip/icon-bar forms instead.
 */
export function BentoCategoryGrid({
  categories,
  onSelect,
}: {
  categories: PublicCategory[]
  onSelect: (slug: string) => void
}) {
  const containerRef = useScrollReveal<HTMLDivElement>({
    selector: '.bento-tile',
    enabled: categories.length > 0,
  })
  const { locale } = useLocale()

  if (categories.length === 0) return null

  return (
    <div ref={containerRef} className="grid grid-cols-3 gap-2 px-4 pb-4">
      {categories.slice(0, 7).map((c, i) => (
        <button
          key={c.slug}
          onClick={() => onSelect(c.slug)}
          className={`bento-tile rounded-2xl bg-gradient-to-br from-[var(--color-action-primary)]/10 to-[var(--color-accent)]/15 p-3 text-start flex flex-col justify-end ${
            i === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square'
          }`}
        >
          <span className={`font-semibold text-[var(--color-text-primary)] ${i === 0 ? 'text-base' : 'text-xs'}`}>
            {locale === 'ar' ? c.nameAr : c.nameFr}
          </span>
        </button>
      ))}
    </div>
  )
}


