import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getOptionalAdminSessionFn } from '~/server/admin-auth'
import { LocaleProvider } from '~/lib/i18n/LocaleContext'

// This is a real path-segment layout (not pathless), so every child route
// file under src/routes/admin/ is automatically served at /admin/... and
// protected by this beforeLoad — EXCEPT /admin/login, which opts itself out
// below since a login page must not require being already logged in.

async function checkAdminSession() {
  const session = await getOptionalAdminSessionFn()
  return { isAuthenticated: session !== null }
}

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ location }) => {
    // Let the login page render without a session; every other /admin/*
    // route requires one.
    if (location.pathname === '/admin/login') return

    const { isAuthenticated } = await checkAdminSession()
    if (!isAuthenticated) {
      throw redirect({
        to: '/admin/login',
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



