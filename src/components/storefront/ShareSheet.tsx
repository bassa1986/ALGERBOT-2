import { useState, useEffect } from 'react'
import { useLocale } from '~/lib/i18n/LocaleContext'

export interface ShareTarget {
  /** The URL to actually share — see telegram-links.ts for how this is
   * built differently for the Telegram-native option vs every other
   * channel. */
  telegramUrl: string
  externalUrl: string
  title: string
  text: string
}

/**
 * FB_APP_ID is required for the Messenger dialog/send flow specifically
 * (Facebook's API requires a registered app id for that endpoint). Set
 * VITE_FACEBOOK_APP_ID once you've created a Facebook App and enabled the
 * Messenger product on it. The plain Facebook Sharer option does NOT need
 * this — only Messenger does.
 */
const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID ?? ''

/**
 * Detects whether navigator.share is actually usable — some in-app
 * WebViews (including, at times, Telegram's own) expose the function but
 * throw or silently no-op when called, so this is a capability check, not
 * a UI decision by itself; the calling component still needs a try/catch
 * around the actual .share() call.
 */
function supportsWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Attempts an app-scheme deep link first (opens the installed app
 * directly), falling back to the universal web URL if the app doesn't
 * handle the scheme within a short window. Inherently a bit racy on the
 * web platform (there's no clean "app not installed" callback), so the
 * fallback timer is deliberately short and only fires if the page is
 * still visible — visibility changing is the signal the app scheme
 * probably worked and backgrounded this tab.
 */
function tryAppSchemeThenFallback(appSchemeUrl: string, fallbackUrl: string) {
  const start = Date.now()
  window.location.href = appSchemeUrl

  setTimeout(() => {
    if (document.visibilityState === 'visible' && Date.now() - start < 1600) {
      window.location.href = fallbackUrl
    }
  }, 1200)
}

export function ShareSheet({
  target,
  isOpen,
  onClose,
}: {
  target: ShareTarget
  isOpen: boolean
  onClose: () => void
}) {
  const { t, dir } = useLocale()
  const [copied, setCopied] = useState(false)
  const [webShareAvailable, setWebShareAvailable] = useState(false)

  useEffect(() => {
    setWebShareAvailable(supportsWebShare())
  }, [])

  if (!isOpen) return null

  const encodedUrl = encodeURIComponent(target.externalUrl)
  const encodedTelegramUrl = encodeURIComponent(target.telegramUrl)
  const shareText = `${target.text} ${target.externalUrl}`
  const encodedShareText = encodeURIComponent(shareText)

  async function handleNativeShare() {
    try {
      await navigator.share({ title: target.title, text: target.text, url: target.externalUrl })
      onClose()
    } catch {
      // AbortError (user cancelled) or any other failure — the manual
      // channel list stays visible either way, so no action needed.
    }
  }

  function handleTelegramShare() {
    // Telegram's own share utility, using the REAL t.me deep link (not
    // the landing page) — sharing from inside Telegram's own share flow
    // never has the "Telegram isn't installed" problem the landing-page
    // redirect exists to solve for every other channel.
    window.open(
      `https://t.me/share/url?url=${encodedTelegramUrl}&text=${encodeURIComponent(target.text)}`,
      '_blank',
    )
    onClose()
  }

  function handleWhatsAppShare() {
    const waAppUrl = `whatsapp://send?text=${encodedShareText}`
    const waWebUrl = `https://wa.me/?text=${encodedShareText}`
    tryAppSchemeThenFallback(waAppUrl, waWebUrl)
    onClose()
  }

  function handleFacebookShare() {
    // Facebook's sharer only reliably accepts the `u` URL param — any
    // caption/text param is ignored in practice, so the buyer adds their
    // own caption on Facebook's own compose screen.
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank')
    onClose()
  }

  function handleMessengerShare() {
    if (!FB_APP_ID) {
      // Config gap: Messenger's dialog/send requires a registered
      // Facebook App ID. Without one, fall back to the Facebook sharer
      // rather than sending the buyer to a broken Facebook error page.
      handleFacebookShare()
      return
    }
    const messengerAppUrl = `fb-messenger://share?link=${encodedUrl}`
    const messengerWebUrl =
      `https://www.facebook.com/dialog/send?link=${encodedUrl}` +
      `&app_id=${encodeURIComponent(FB_APP_ID)}&redirect_uri=${encodedUrl}`
    tryAppSchemeThenFallback(messengerAppUrl, messengerWebUrl)
    onClose()
  }

  function handleEmailShare() {
    window.location.href =
      `mailto:?subject=${encodeURIComponent(target.title)}&body=${encodedShareText}`
    onClose()
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(target.externalUrl)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      onClose()
    }, 900)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      dir={dir}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[var(--color-surface)] p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-border)]" />

        {webShareAvailable && (
          <button
            onClick={handleNativeShare}
            className="mb-3 w-full rounded-full bg-[var(--color-action-primary)] px-4 py-3 text-sm font-semibold text-white"
          >
            {t.share.moreOptions}
          </button>
        )}

        <div className="grid grid-cols-4 gap-3 mb-3">
          <ShareChannelButton emoji="✈️" label="Telegram" onClick={handleTelegramShare} />
          <ShareChannelButton emoji="💬" label="WhatsApp" onClick={handleWhatsAppShare} />
          <ShareChannelButton emoji="📘" label="Facebook" onClick={handleFacebookShare} />
          <ShareChannelButton emoji="💌" label="Messenger" onClick={handleMessengerShare} />
          <ShareChannelButton emoji="📧" label={t.share.email} onClick={handleEmailShare} />
        </div>

        <button
          onClick={handleCopyLink}
          className="w-full rounded-full border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {copied ? t.share.linkCopied : t.share.copyLink}
        </button>
      </div>
    </div>
  )
}

function ShareChannelButton({
  emoji,
  label,
  onClick,
}: {
  emoji: string
  label: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-xl">
        {emoji}
      </span>
      <span className="text-[10px] text-[var(--color-text-muted)] truncate w-full text-center">
        {label}
      </span>
    </button>
  )
}
