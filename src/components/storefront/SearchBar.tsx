import { useLocale } from '~/lib/i18n/LocaleContext'

export function SearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useLocale()
  return (
    <div className="px-4">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.searchPlaceholder}
        className="w-full rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm"
      />
    </div>
  )
}
