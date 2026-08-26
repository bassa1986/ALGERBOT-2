import { useLocale } from '~/lib/i18n/LocaleContext'

export function LanguageSwitch() {
  const { locale, setLocale, t } = useLocale()

  return (
    <button
      onClick={() => setLocale(locale === 'ar' ? 'fr' : 'ar')}
      className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)]"
      aria-label="Changer de langue / تغيير اللغة"
    >
      {t.langSwitch}
    </button>
  )
}
