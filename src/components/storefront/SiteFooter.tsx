import { Link } from '@tanstack/react-router'
import { useLocale } from '~/lib/i18n/LocaleContext'

export function SiteFooter() {
  const { t } = useLocale()
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-[var(--color-border)] px-4 py-6 text-center">
      <div className="flex flex-wrap items-center justify-center gap-4 mb-3">
        <Link to="/privacy" className="text-sm text-[var(--color-text-muted)] underline">
          {t.footerPrivacy}
        </Link>
        <Link to="/contact" className="text-sm text-[var(--color-text-muted)] underline">
          {t.footerContact}
        </Link>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        © {year} AlgerBot — {t.footerRights}
      </p>
    </footer>
  )
}
