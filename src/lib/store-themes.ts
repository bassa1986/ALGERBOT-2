// Curated storefront color themes a merchant can pick for their own
// store (Store Settings > Appearance) -- deliberately NOT a free-form
// color picker. Each preset only overrides the "brand" tokens (action
// color + its hover state + the accent color used for badges/highlights)
// -- surface, text, and border colors are left untouched everywhere, so
// every preset is guaranteed to stay legible against the rest of the
// design system rather than risking a merchant picking a combination
// with bad contrast.
//
// Applied as a scoped CSS custom-property override on the store's own
// layout wrapper (see StorefrontThemeProvider), so it only affects that
// one store's pages -- the marketplace homepage and every other store
// keep the default AlgerBot palette regardless of what any merchant
// picks here.

export interface StoreTheme {
  id: string
  labelAr: string
  labelFr: string
  actionPrimary: string
  actionPrimaryHover: string
  accent: string
}

export const THEME_PRESETS: StoreTheme[] = [
  {
    id: 'default',
    labelAr: 'الافتراضي (AlgerBot)',
    labelFr: 'Par défaut (AlgerBot)',
    actionPrimary: '#c1502e',
    actionPrimaryHover: '#a03f22',
    accent: '#e8a33d',
  },
  {
    id: 'ocean',
    labelAr: 'أزرق المحيط',
    labelFr: 'Bleu océan',
    actionPrimary: '#1f6f8b',
    actionPrimaryHover: '#175267',
    accent: '#7fc6e0',
  },
  {
    id: 'forest',
    labelAr: 'أخضر الغابة',
    labelFr: 'Vert forêt',
    actionPrimary: '#2f6b3a',
    actionPrimaryHover: '#204d28',
    accent: '#8fbf6e',
  },
  {
    id: 'plum',
    labelAr: 'بنفسجي داكن',
    labelFr: 'Prune',
    actionPrimary: '#6d3b6e',
    actionPrimaryHover: '#502a51',
    accent: '#c98fca',
  },
  {
    id: 'rose',
    labelAr: 'وردي',
    labelFr: 'Rose',
    actionPrimary: '#b8385f',
    actionPrimaryHover: '#8f2a49',
    accent: '#f0a5bc',
  },
  {
    id: 'slate',
    labelAr: 'رمادي أنيق',
    labelFr: 'Gris ardoise',
    actionPrimary: '#44546b',
    actionPrimaryHover: '#2f3c4d',
    accent: '#9fb0c3',
  },
]

export function getStoreTheme(themeId: string | null): StoreTheme {
  return THEME_PRESETS.find((t) => t.id === themeId) ?? THEME_PRESETS[0]
}

/**
 * Tuple form of every preset's id, for z.enum() validation on the
 * server (src/server/store.ts) — z.enum requires a readonly tuple of
 * string literals, not a plain string[], so this is kept in sync with
 * THEME_PRESETS by deriving it rather than hand-listing ids a second time.
 */
export const THEME_IDS = THEME_PRESETS.map((t) => t.id) as [string, ...string[]]
