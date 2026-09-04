import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { createFirstAdmin } from '~/server/admin-auth'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'

// One-time admin account creation. Only ever works once — createFirstAdmin
// rejects the request server-side (via a database-level unique index, see
// migration 0011) the moment an admin account already exists, so this page
// isn't a standing "create another admin" tool, just the initial setup step.
export const Route = createFileRoute('/admin/setup')({
  component: AdminSetupPage,
})

function AdminSetupPage() {
  const navigate = useNavigate()
  const createAdmin = useServerFn(createFirstAdmin)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { locale, dir } = useLocale()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Les mots de passe ne correspondent pas')
      return
    }
    if (password.length < 10) {
      setError(
        locale === 'ar'
          ? 'يجب أن تتكون كلمة المرور من 10 أحرف على الأقل'
          : 'Le mot de passe doit contenir au moins 10 caractères',
      )
      return
    }

    setIsSubmitting(true)
    try {
      await createAdmin({ data: { email, password, fullName } })
      await navigate({ to: '/admin/login' })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : locale === 'ar'
            ? 'حدث خطأ ما'
            : "Une erreur s'est produite",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitch />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-2 text-center">
          {locale === 'ar' ? 'إنشاء حساب المدير' : 'Créer le compte administrateur'}
        </h1>
        <p className="text-xs text-[var(--color-text-muted)] mb-5 text-center">
          {locale === 'ar'
            ? 'هذه الصفحة تعمل مرة واحدة فقط — لا يمكن إنشاء أكثر من حساب مدير واحد.'
            : "Cette page ne fonctionne qu'une seule fois — un seul compte administrateur peut être créé."}
        </p>

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {locale === 'ar' ? 'الاسم الكامل' : 'Nom complet'}
        </label>
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Email</label>
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
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {locale === 'ar' ? 'تأكيد كلمة المرور' : 'Confirmer le mot de passe'}
        </label>
        <input
          type="password"
          required
          minLength={10}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
        />

        {error && <p className="text-sm text-[var(--color-danger)] mb-3">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting
            ? locale === 'ar'
              ? 'جارٍ الإنشاء...'
              : 'Création...'
            : locale === 'ar'
              ? 'إنشاء الحساب'
              : 'Créer le compte'}
        </button>

        <Link to="/admin/login" className="mt-3 block text-center text-sm text-[var(--color-text-muted)] underline">
          {locale === 'ar' ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'Vous avez déjà un compte ? Se connecter'}
        </Link>
      </form>
    </div>
  )
}
