// Thin typed wrapper around window.Telegram.WebApp. Every method here is
// safe to call even when the script hasn't loaded or the page is open in a
// normal browser — it becomes a no-op rather than throwing, so the same
// component code works identically inside Telegram and standalone.

export interface TelegramThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
}

interface TelegramWebAppApi {
  initData: string
  initDataUnsafe: Record<string, unknown>
  colorScheme: 'light' | 'dark'
  themeParams: TelegramThemeParams
  ready: () => void
  expand: () => void
  close: () => void
  MainButton: {
    text: string
    show: () => void
    hide: () => void
    onClick: (fn: () => void) => void
    offClick: (fn: () => void) => void
    setText: (text: string) => void
    showProgress: (leaveActive?: boolean) => void
    hideProgress: () => void
    enable: () => void
    disable: () => void
  }
  BackButton: {
    show: () => void
    hide: () => void
    onClick: (fn: () => void) => void
    offClick: (fn: () => void) => void
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  onEvent: (eventType: string, callback: () => void) => void
  offEvent: (eventType: string, callback: () => void) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebAppApi }
  }
}

function getWebApp(): TelegramWebAppApi | null {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp ?? null
}

export function isInsideTelegram(): boolean {
  return getWebApp() !== null
}

export function getInitData(): string | null {
  const app = getWebApp()
  return app && app.initData.length > 0 ? app.initData : null
}

export function getTelegramThemeParams(): TelegramThemeParams | null {
  return getWebApp()?.themeParams ?? null
}

export function initTelegramWebApp(): void {
  const app = getWebApp()
  if (!app) return
  app.ready()
  app.expand()
}

export function setMainButton(opts: {
  text: string
  onClick: () => void
  disabled?: boolean
}): () => void {
  const app = getWebApp()
  if (!app) return () => {}

  app.MainButton.setText(opts.text)
  if (opts.disabled) app.MainButton.disable()
  else app.MainButton.enable()
  app.MainButton.show()
  app.MainButton.onClick(opts.onClick)

  return () => {
    app.MainButton.offClick(opts.onClick)
    app.MainButton.hide()
  }
}

export function hideMainButton(): void {
  getWebApp()?.MainButton.hide()
}

export function setBackButton(onClick: () => void): () => void {
  const app = getWebApp()
  if (!app) return () => {}

  app.BackButton.show()
  app.BackButton.onClick(onClick)

  return () => {
    app.BackButton.offClick(onClick)
    app.BackButton.hide()
  }
}

export function hideBackButton(): void {
  getWebApp()?.BackButton.hide()
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  getWebApp()?.HapticFeedback.impactOccurred(style)
}

export function hapticNotification(type: 'error' | 'success' | 'warning'): void {
  getWebApp()?.HapticFeedback.notificationOccurred(type)
}

export function hapticSelectionChanged(): void {
  getWebApp()?.HapticFeedback.selectionChanged()
}
