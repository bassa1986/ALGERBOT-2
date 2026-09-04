import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { requestAdminPasswordReset } from '~/server/admin-auth'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'

export const Route = createFileRoute('/admin/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const requestReset = useServerFn(requestAdminPasswordReset)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const { locale, dir } = useLocale()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await requestReset({ data: { email } })
    } finally {
      // Always show the same "check your email" state, whether or not the
      // address actually matched an admin account — see the enumeration-
      // defense note in requestAdminPasswordReset itself.
      setIsSubmitting(false)
      setIsSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitch />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] mb-5 text-center">
          {locale === 'ar' ? 'استعادة كلمة المرور' : 'Mot de passe oublié'}
        </h1>

        {isSent ? (
          <p className="text-sm text-[var(--color-text-primary)] mb-4 text-center">
            {locale === 'ar'
              ? 'إذا كان هذا البريد الإلكتروني مرتبطًا بحساب، فسنرسل رابط إعادة تعيين كلمة المرور إليه. تحقق من صندوق الوارد الخاص بك.'
              : "Si cette adresse correspond à un compte, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception."}
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-4"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {isSubmitting
                ? locale === 'ar'
                  ? 'جارٍ الإرسال...'
                  : 'Envoi...'
                : locale === 'ar'
                  ? 'إرسال رابط إعادة التعيين'
                  : 'Envoyer le lien de réinitialisation'}
            </button>
          </form>
        )}

        <Link to="/admin/login" className="mt-3 block text-center text-sm text-[var(--color-text-muted)] underline">
          {locale === 'ar' ? 'العودة إلى تسجيل الدخول' : 'Retour à la connexion'}
        </Link>
      </div>
    </div>
  )
}
