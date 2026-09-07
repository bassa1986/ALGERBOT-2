import type { ReactNode, CSSProperties } from 'react'
import { getStoreTheme } from '~/lib/store-themes'

/**
 * Applies a store's chosen color theme as a scoped CSS custom-property
 * override on this wrapper element only -- every descendant that
 * references var(--color-action-primary) etc. (which is how every
 * component in this codebase reads these tokens, via Tailwind's
 * arbitrary-value bracket syntax, e.g. bg-[var(--color-action-primary)])
 * picks up the override through normal CSS cascade, while the
 * marketplace homepage and every other store keep the global default
 * declared in styles.css's :root -- this override never leaks outside
 * this wrapper's subtree.
 *
 * themeId === null (the default for every store unless a merchant
 * changes it) renders no override at all -- the store simply inherits
 * the global default theme, unchanged.
 */
export function StorefrontThemeProvider({ themeId, children }: { themeId: string | null; children: ReactNode }) {
  if (!themeId || themeId === 'default') return <>{children}</>

  const theme = getStoreTheme(themeId)
  return (
    <div
      style={
        {
          '--color-action-primary': theme.actionPrimary,
          '--color-action-primary-hover': theme.actionPrimaryHover,
          '--color-accent': theme.accent,
        } as CSSProperties
      }
    >
      {children}
    </div>
  )
}
