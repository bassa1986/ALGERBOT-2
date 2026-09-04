import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn, createServerFn } from '@tanstack/react-start'
import { loginAsAdmin } from '~/server/admin-auth'
import { getOptionalAdminSessionFn } from '~/server/admin-auth'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'

function sanitizeRedirect(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) {
    return '/admin'
  }
  return url
}

async function checkSession() {
  const session = await getOptionalAdminSessionFn()
  return { isAuthenticated: session !== null }
}

export const Route = createFileRoute('/admin/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  beforeLoad: async ({ search }) => {
    const { isAuthenticated } = await checkSession()
    if (isAuthenticated) {
      throw redirect({ to: search.redirect })
    }
  },
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const login = useServerFn(loginAsAdmin)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { locale, dir } = useLocale()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login({ data: { email, password } })
      await navigate({ to: search.redirect })
    } catch {
      // Same generic message regardless of which check failed, per
      // enumeration-defense practice in loginAsAdmin.
      setError(locale === 'ar' ? 'البريد الإلكتروني أو كلمة المرور غير صالحة' : 'Email ou mot de passe invalide')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm"
      >
        <div className="flex justify-end mb-2">
          <LanguageSwitch />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-5 text-center">
          {locale === 'ar' ? 'إدارة AlgerBot' : 'Administration AlgerBot'}
        </h1>

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {locale === 'ar' ? 'كلمة المرور' : 'Mot de passe'}
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        {error && (
          <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting
            ? (locale === 'ar' ? 'جارٍ الاتصال...' : 'Connexion...')
            : (locale === 'ar' ? 'تسجيل الدخول' : 'Se connecter')}
        </button>

        <Link
          to="/admin/forgot-password"
          className="mt-3 block text-center text-sm text-[var(--color-text-muted)] underline"
        >
          {locale === 'ar' ? 'نسيت كلمة المرور؟' : 'Mot de passe oublié ?'}
        </Link>
      </form>
    </div>
  )
}



