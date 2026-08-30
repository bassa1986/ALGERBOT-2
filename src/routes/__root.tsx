import type { ReactNode } from 'react'
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
    links: [{ rel: 'stylesheet', href: appCss }],
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
})

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

