import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { loginWithTelegramWidget, getOptionalSession, getTelegramBotUsername, requestWhatsAppLoginOtp, verifyWhatsAppLoginOtp } from '~/server/auth'
import { createServerFn } from '@tanstack/react-start'

// Validate the redirect target to prevent open-redirect: only relative
// paths are accepted, never a scheme-qualified or protocol-relative URL.
function sanitizeRedirect(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) {
    return '/dashboard'
  }
  return url
}

const checkSession = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getOptionalSession()
  return { isAuthenticated: session !== null }
})

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  beforeLoad: async ({ search }) => {
    const { isAuthenticated } = await checkSession()
    if (isAuthenticated) {
      throw redirect({ to: search.redirect })
    }
  },
  // TELEGRAM_BOT_USERNAME is read here, server-side, at REQUEST time (not
  // Vite's import.meta.env, which is baked in at BUILD time and was empty
  // in production because PivoCloud injects env vars into the running
  // container, not into the Docker build step — so the widget-injection
  // code below was being silently dead-code-eliminated by the minifier).
  loader: async () => {
    const { botUsername } = await getTelegramBotUsername()
    return { botUsername }
  },
  component: LoginPage,
})

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthPayload) => void
  }
}

interface TelegramAuthPayload {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

const telegramPayloadSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
})

function LoginPage() {
  const search = Route.useSearch()
  const { botUsername } = Route.useLoaderData()
  const navigate = useNavigate()
  const widgetContainerRef = useRef<HTMLDivElement>(null)
  const login = useServerFn(loginWithTelegramWidget)
  const requestOtp = useServerFn(requestWhatsAppLoginOtp)
  const verifyOtp = useServerFn(verifyWhatsAppLoginOtp)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // WhatsApp login is a second door into the SAME merchant account
  // Telegram reaches — not a separate signup. It only works for a number
  // already linked to an account via Store Settings > WhatsApp (see
  // updateMyWhatsAppNumber). "sso" step order: enter number -> request
  // code -> enter code -> verify.
  const [showWhatsAppLogin, setShowWhatsAppLogin] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<'number' | 'code'>('number')
  const [isOtpBusy, setIsOtpBusy] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null)

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    setOtpError(null)
    setIsOtpBusy(true)
    try {
      await requestOtp({ data: { whatsappNumber } })
      // Always the same success message regardless of whether the number
      // is actually linked to an account — matches the server's own
      // enumeration-safe response shape (see requestWhatsAppLoginOtp).
      setOtpSentMessage(
        "Si ce numéro est associé à un compte, un code vient d'être envoyé par WhatsApp.",
      )
      setOtpStep('code')
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Une erreur s'est produite")
    } finally {
      setIsOtpBusy(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setOtpError(null)
    setIsOtpBusy(true)
    try {
      const result = await verifyOtp({ data: { whatsappNumber, code: otpCode } })
      if (result.needsOnboarding) {
        await navigate({ to: '/pricing', search: { next: search.redirect } })
      } else {
        await navigate({ to: search.redirect })
      }
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Une erreur s'est produite")
    } finally {
      setIsOtpBusy(false)
    }
  }

  useEffect(() => {
    window.onTelegramAuth = async (user: TelegramAuthPayload) => {
      setError(null)
      setIsAuthenticating(true)
      const parsed = telegramPayloadSchema.parse(user)
      try {
        const result = await login({ data: parsed })
        if (result.needsOnboarding) {
          await navigate({ to: '/pricing', search: { next: search.redirect } })
        } else {
          await navigate({ to: search.redirect })
        }
      } catch {
        // A verification failure here means a stale or tampered widget
        // payload; simplest recovery is to let the merchant retry. Shown
        // inline rather than window.alert(), matching every other form's
        // error display in this app instead of a jarring, thread-blocking
        // native dialog.
        setError("Échec de la connexion. Veuillez réessayer.")
        setIsAuthenticating(false)
      }
    }

    if (!botUsername) return

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    widgetContainerRef.current?.appendChild(script)

    return () => {
      delete window.onTelegramAuth
    }
  }, [login, navigate, search.redirect, botUsername])

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
          AlgerBot
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Connectez-vous avec votre compte Telegram pour gérer votre boutique.
        </p>
        <div ref={widgetContainerRef} className={isAuthenticating ? 'hidden' : 'flex justify-center'} />
        {isAuthenticating && (
          <p className="text-sm text-[var(--color-text-muted)]">Connexion en cours...</p>
        )}
        {error && <p className="text-sm text-[var(--color-danger)] mt-3">{error}</p>}
        {!botUsername && (
          <p className="text-xs text-[var(--color-danger)] mt-4">
            Configuration manquante : TELEGRAM_BOT_USERNAME
          </p>
        )}

        <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
          {!showWhatsAppLogin ? (
            <button
              type="button"
              onClick={() => setShowWhatsAppLogin(true)}
              className="text-sm text-[var(--color-text-muted)] underline"
            >
              Se connecter avec WhatsApp à la place
            </button>
          ) : otpStep === 'number' ? (
            <form onSubmit={handleRequestOtp}>
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1 text-start">
                Numéro WhatsApp lié à votre compte
              </label>
              <input
                type="tel"
                required
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="0555 12 34 56"
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3"
              />
              {otpError && <p className="text-sm text-[var(--color-danger)] mb-3">{otpError}</p>}
              <button
                type="submit"
                disabled={isOtpBusy}
                className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
              >
                {isOtpBusy ? 'Envoi...' : 'Recevoir un code par WhatsApp'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              {otpSentMessage && (
                <p className="text-xs text-[var(--color-text-muted)] mb-3">{otpSentMessage}</p>
              )}
              <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1 text-start">
                Code reçu par WhatsApp
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 mb-3 text-center tracking-widest"
              />
              {otpError && <p className="text-sm text-[var(--color-danger)] mb-3">{otpError}</p>}
              <button
                type="submit"
                disabled={isOtpBusy}
                className="w-full rounded-full bg-[var(--color-action-primary)] px-4 py-2.5 font-semibold text-white disabled:opacity-50 mb-2"
              >
                {isOtpBusy ? 'Vérification...' : 'Se connecter'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpStep('number')
                  setOtpCode('')
                  setOtpError(null)
                }}
                className="text-xs text-[var(--color-text-muted)] underline"
              >
                Changer de numéro
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
