import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { loginWithTelegramWidget, getOptionalSession, getTelegramBotUsername } from '~/server/auth'
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

  useEffect(() => {
    window.onTelegramAuth = async (user: TelegramAuthPayload) => {
      const parsed = telegramPayloadSchema.parse(user)
      try {
        await login({ data: parsed })
        await navigate({ to: search.redirect })
      } catch {
        // A verification failure here means a stale or tampered widget
        // payload; simplest recovery is to let the merchant retry.
        window.alert("Échec de la connexion. Veuillez réessayer.")
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
        <div ref={widgetContainerRef} className="flex justify-center" />
        {!botUsername && (
          <p className="text-xs text-[var(--color-danger)] mt-4">
            Configuration manquante : TELEGRAM_BOT_USERNAME
          </p>
        )}
      </div>
    </div>
  )
}
