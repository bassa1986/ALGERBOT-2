import { useEffect } from 'react'
import { initTelegramWebApp, getTelegramThemeParams, isInsideTelegram } from '~/lib/telegram-webapp.browser'

/**
 * Mounted once at the root. Calls Telegram.WebApp.ready()/expand() and, if
 * the WebView provides theme colors, overrides a SMALL subset of our
 * semantic tokens with Telegram's theme so the chrome (background, text)
 * blends with the user's Telegram theme (light/dark) — while deliberately
 * NOT touching --color-action-primary/--color-accent, since AlgerBot's
 * terracotta/saffron brand identity should stay recognizable rather than
 * being fully replaced by Telegram's generic blue. Outside Telegram this
 * effect does nothing and the app keeps its own default palette.
 */
export function TelegramWebAppInit() {
  useEffect(() => {
    initTelegramWebApp()

    if (!isInsideTelegram()) return
    const theme = getTelegramThemeParams()
    if (!theme) return

    const root = document.documentElement.style
    if (theme.bg_color) root.setProperty('--color-surface-muted', theme.bg_color)
    if (theme.secondary_bg_color) root.setProperty('--color-surface', theme.secondary_bg_color)
    if (theme.text_color) root.setProperty('--color-text-primary', theme.text_color)
    if (theme.hint_color) root.setProperty('--color-text-muted', theme.hint_color)
  }, [])

  return null
}
