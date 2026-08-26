import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useServerFn, createServerFn } from '@tanstack/react-start'
import { loginWithTelegramWebApp } from '~/server/auth'
import { getInitData, isInsideTelegram, initTelegramWebApp } from '~/lib/telegram-webapp.browser'
import { getOptionalMerchantSession } from '~/lib/auth'

const checkSession = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getOptionalMerchantSession()
  return { isAuthenticated: session !== null }
})

/**
 * Entry point when the merchant opens the app's Telegram bot menu button —
 * Telegram launches this URL inside its WebView. If already authenticated,
 * skip straight to the dashboard. Otherwise, sign in silently using
 * WebApp initData (no widget click needed — Telegram already knows who
 * the user is). Opened in a normal browser (no Telegram context), this
 * route just bounces to the regular login-widget page instead.
 */
export const Route = createFileRoute('/telegram-entry')({
  beforeLoad: async () => {
    const { isAuthenticated } = await checkSession()
    if (isAuthenticated) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: TelegramEntryPage,
})

function TelegramEntryPage() {
  const navigate = useNavigate()
  const login = useServerFn(loginWithTelegramWebApp)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initTelegramWebApp()

    if (!isInsideTelegram()) {
      navigate({ to: '/login', search: { redirect: '/dashboard' } })
      return
    }

    const initData = getInitData()
    if (!initData) {
      setError("Impossible de vérifier votre compte Telegram. Réessayez depuis le bot.")
      return
    }

    login({ data: { initData } })
      .then((result) => {
        navigate({ to: result.needsOnboarding ? '/onboarding' : '/dashboard' })
      })
      .catch(() => {
        setError('Échec de la connexion. Réessayez depuis le bot.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4">
      <div className="text-center">
        {error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Connexion en cours...</p>
        )}
      </div>
    </div>
  )
}
