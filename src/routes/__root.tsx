import { useState, type ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  ClientOnly,
} from '@tanstack/react-router'
import appCss from '~/styles.css?url'
import { TelegramWebAppInit } from '~/components/TelegramWebAppInit.client'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'AlgerBot' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
    scripts: [{ src: 'https://telegram.org/js/telegram-web-app.js' }],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">404</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Page introuvable — الصفحة غير موجودة
        </p>
      </div>
    </div>
  ),
  errorComponent: RootErrorComponent,
})

/**
 * Replaces the router's bare default error boundary (literally titled
 * "Something went wrong!" with a raw "Show Error" toggle) with copy a real
 * customer can act on. In particular, publicRateLimit (15 req/min per IP —
 * see src/lib/rate-limit.ts) throws a plain `Error('Too many requests...')`
 * from any public storefront server function, and that was previously
 * surfacing as an indistinguishable hard crash instead of "please wait a
 * moment" — a normal, expected condition (a customer's phone retrying a
 * flaky request, or several tabs open) shouldn't look identical to an
 * actual bug.
 */
function RootErrorComponent({ error, reset }: { error: unknown; reset?: () => void }) {
  const message = error instanceof Error ? error.message : String(error)
  const isRateLimited = message.toLowerCase().includes('too many requests')
  const [showDetails, setShowDetails] = useState(false)

  const retry = () => {
    if (reset) reset()
    else window.location.reload()
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <p className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
          {isRateLimited ? 'Un instant…' : 'Une erreur est survenue'}
        </p>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          {isRateLimited ? (
            <>
              Trop de requêtes en peu de temps. Merci de patienter quelques secondes puis réessayer.
              <br />
              الرجاء الانتظار قليلاً ثم إعادة المحاولة
            </>
          ) : (
            <>
              Veuillez réessayer ou recharger la page.
              <br />
              يرجى إعادة المحاولة أو تحديث الصفحة
            </>
          )}
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={retry}
            className="px-4 py-2 rounded-md bg-[var(--color-action-primary)] text-white text-sm font-medium"
          >
            Réessayer
          </button>
          {!isRateLimited && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="px-4 py-2 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-muted)]"
            >
              {showDetails ? 'Masquer les détails' : 'Afficher les détails'}
            </button>
          )}
        </div>
        {showDetails && !isRateLimited && (
          <pre className="mt-4 text-left text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] p-3 rounded-md overflow-auto max-h-64 whitespace-pre-wrap break-words">
            {message}
          </pre>
        )}
      </div>
    </div>
  )
}

function RootComponent() {
  return (
    <RootDocument>
      <ClientOnly fallback={null}>
        <TelegramWebAppInit />
      </ClientOnly>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <script
          type="importmap"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              imports: {
                postgres: 'data:text/javascript,export default {};',
                '@tanstack/react-start/server': 'data:text/javascript,export default {};',
              },
            }),
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

