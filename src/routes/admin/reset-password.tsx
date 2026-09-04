import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { resetAdminPassword } from '~/server/admin-auth'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'

export const Route = createFileRoute('/admin/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const resetPassword = useServerFn(resetAdminPassword)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const { locale, dir } = useLocale()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Les mots de passe ne correspondent pas')
      return
    }
    if (newPassword.length < 10) {
      setError(
        locale === 'ar'
          ? 'يجب أن تتكون كلمة المرور من 10 أحرف على الأقل'
          : 'Le mot de passe doit contenir au moins 10 caractères',
      )
      return
    }

    setIsSubmitting(true)
    try {
      await resetPassword({ data: { token: search.token, newPassword } })
      setIsDone(true)
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

  if (!search.token) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
        <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm text-center">
          <p className="text-sm text-[var(--color-danger)] mb-4">
            {locale === 'ar' ? 'رابط إعادة التعيين غير صالح.' : 'Lien de réinitialisation invalide.'}
          </p>
          <Link to="/admin/forgot-password" className="text-sm text-[var(--color-action-primary)] underline">
            {locale === 'ar' ? 'طلب رابط جديد' : 'Demander un nouveau lien'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitch />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-5 text-center">
          {locale === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Réinitialiser le mot de passe'}
        </h1>

        {isDone ? (
          <>
            <p className="text-sm text-[var(--color-text-primary)] mb-4 text-center">
              {locale === 'ar'
                ? 'تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.'
                : 'Mot de passe mis à jour. Vous pouvez maintenant vous connecter.'}
            </p>
            <button
              onClick={() => navigate({ to: '/admin/login' })}
              className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white"
            >
              {locale === 'ar' ? 'تسجيل الدخول' : 'Se connecter'}
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
              {locale === 'ar' ? 'كلمة المرور الجديدة' : 'Nouveau mot de passe'}
            </label>
            <input
              type="password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
                  ? 'جارٍ الحفظ...'
                  : 'Enregistrement...'
                : locale === 'ar'
                  ? 'تعيين كلمة المرور الجديدة'
                  : 'Définir le nouveau mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
