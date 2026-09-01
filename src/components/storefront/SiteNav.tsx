import { Link } from '@tanstack/react-router'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'

const linkClass =
  'shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)]'

export function SiteNav() {
  const { t } = useLocale()
  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 px-4 pb-3">
      <Link to="/pricing" className={linkClass}>
        {t.navPricing}
      </Link>
      <Link to="/login" search={{ redirect: '/dashboard' }} className={linkClass}>
        {t.navLogin}
      </Link>
      <Link to="/order-lookup" className={linkClass}>
        {t.trackOrder}
      </Link>
      <LanguageSwitch />
    </nav>
  )
}
