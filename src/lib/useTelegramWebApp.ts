import { useEffect, useState } from 'react'
import { isInsideTelegram, setBackButton } from '~/lib/telegram-webapp.browser'

/**
 * SSR-friendly access to Telegram WebApp state. isInsideTelegram() itself
 * already checks `typeof window` internally and is safe to call anywhere,
 * but this hook exists to give components a reactive boolean rather than
 * requiring them to call the function directly at render time (which
 * would read as always-false during SSR/first-paint and only update after
 * an effect runs anyway).
 */
export function useIsInsideTelegram(): boolean {
  const [isInTelegram, setIsInTelegram] = useState(false)

  useEffect(() => {
    setIsInTelegram(isInsideTelegram())
  }, [])

  return isInTelegram
}

/**
 * Binds Telegram's native BackButton to the given handler for as long as
 * the calling component is mounted.
 */
export function useTelegramBackButton(onClick: () => void, deps: unknown[] = []): void {
  useEffect(() => {
    return setBackButton(onClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
