import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, LOCALE_DIR, type Locale, type TranslationDictionary } from './translations'

const STORAGE_KEY = 'algerbot-locale'
const DEFAULT_LOCALE: Locale = 'ar' // Arabic-first per spec

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TranslationDictionary
  dir: 'rtl' | 'ltr'
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'fr' || stored === 'ar' ? stored : DEFAULT_LOCALE
}

/**
 * Mounted once per page tree that needs language switching (marketplace
 * home, storefront). Arabic is the default on first visit, per the
 * "Arabic-first UI" requirement; the buyer's choice persists across visits
 * via localStorage once they toggle.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  // Read the persisted preference after mount (not during SSR/first
  // render) to avoid a server/client markup mismatch — the page always
  // renders Arabic-first on the initial paint, then swaps if the visitor
  // previously chose French.
  useEffect(() => {
    setLocaleState(readStoredLocale())
  }, [])

  function setLocale(next: Locale) {
    setLocaleState(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  const dir = LOCALE_DIR[locale]

  useEffect(() => {
    document.documentElement.dir = dir
    document.documentElement.lang = locale
  }, [dir, locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: translations[locale], dir }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}
