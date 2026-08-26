import type { Locale } from './translations'

/**
 * Formats an integer centimes amount as DZD, matching the given locale.
 * Arabic locale uses ar-DZ formatting (which Intl renders with Eastern
 * Arabic-Indic digits on most platforms); French uses fr-DZ with Western
 * digits. Falls back to a plain fixed-point string if Intl.NumberFormat
 * throws for an unsupported locale/currency pairing in the runtime.
 */
export function formatDzd(centimes: number, locale: Locale): string {
  const amount = centimes / 100
  try {
    const intlLocale = locale === 'ar' ? 'ar-DZ' : 'fr-DZ'
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: 'DZD',
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} DZD`
  }
}

/** Locale-aware date formatting, used for order timestamps. */
export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const intlLocale = locale === 'ar' ? 'ar-DZ' : 'fr-DZ'
  try {
    return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}
