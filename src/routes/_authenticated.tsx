import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getOptionalSession } from '~/server/auth'
import { LocaleProvider } from '~/lib/i18n/LocaleContext'

async function checkMerchantSession() {
  const session = await getOptionalSession()
  return { isAuthenticated: session !== null }
}

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




