import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getOptionalMerchantSession } from '~/lib/auth'
import { LocaleProvider } from '~/lib/i18n/LocaleContext'

// Every route file under src/routes/_authenticated/ is automatically
// protected by this layout's beforeLoad. This guards the PAGE UX only —
// each server function under here still enforces auth independently via
// merchantAuthMiddleware, since server functions are reachable directly
// regardless of which route renders the calling UI.

const checkMerchantSession = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getOptionalMerchantSession()
  return { isAuthenticated: session !== null }
})

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const { isAuthenticated } = await checkMerchantSession()
    if (!isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  component: () => (
    <LocaleProvider>
      <Outlet />
    </LocaleProvider>
  ),
})
