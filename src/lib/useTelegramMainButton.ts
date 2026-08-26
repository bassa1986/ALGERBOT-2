import { useEffect } from 'react'
import { setMainButton, hideMainButton, hapticNotification } from '~/lib/telegram-webapp.browser'

/**
 * Binds Telegram's native MainButton to the given action while this
 * component is mounted and `enabled` is true. Outside Telegram this is a
 * complete no-op — callers still render their own in-page submit button,
 * which is what actually gets used in a normal browser.
 */
export function useTelegramMainButton(opts: {
  text: string
  onClick: () => void
  enabled: boolean
  isLoading?: boolean
}) {
  const { text, onClick, enabled, isLoading = false } = opts

  useEffect(() => {
    if (!enabled) {
      hideMainButton()
      return
    }
    const cleanup = setMainButton({ text, onClick, disabled: isLoading })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, onClick, enabled, isLoading])
}

export function notifyTelegramResult(type: 'success' | 'error'): void {
  hapticNotification(type)
}
