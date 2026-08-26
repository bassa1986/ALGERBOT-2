import { useEffect, useRef } from 'react'

/**
 * Reads the Telegram Mini App start_param — set via a t.me deep link's
 * ?startapp=<value> query string — from wherever it's actually available.
 * Telegram exposes it two ways depending on context:
 *   1. window.Telegram.WebApp.initDataUnsafe.start_param (once the WebApp
 *      script has loaded and initData was populated by Telegram)
 *   2. The `tgWebAppStartParam` URL query parameter, which Telegram also
 *      appends to the WebView's URL in some launch paths, and which is
 *      the only source available if the WebApp script hasn't finished
 *      initializing yet.
 * Checking both, in this order, covers the actual variance in when each
 * becomes available.
 */
export function getStartParam(): string | null {
  if (typeof window === 'undefined') return null

  const webApp = window.Telegram?.WebApp as
    | { initDataUnsafe?: { start_param?: string } }
    | undefined
  const fromInitData = webApp?.initDataUnsafe?.start_param
  if (fromInitData) return fromInitData

  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('tgWebAppStartParam')
  if (fromUrl) return fromUrl

  return null
}

/**
 * Reads the buyer's display name from Telegram's initDataUnsafe.user, for
 * PURE AUTOFILL convenience on the guest checkout form only. This does
 * NOT create a buyer account or session — AlgerBot's checkout is, by
 * original design, guest-only (no buyer accounts at all); this just saves
 * a already-in-Telegram buyer from retyping their name. Returns null
 * outside Telegram, or if Telegram hasn't populated user info (e.g. the
 * buyer has privacy settings that withhold it) — callers should treat a
 * null return as "no autofill available," not an error.
 */
export function getTelegramBuyerDisplayName(): string | null {
  if (typeof window === 'undefined') return null
  const user = window.Telegram?.WebApp?.initDataUnsafe as
    | { user?: { first_name?: string; last_name?: string } }
    | undefined
  const firstName = user?.user?.first_name
  const lastName = user?.user?.last_name
  if (!firstName) return null
  return lastName ? `${firstName} ${lastName}` : firstName
}

const MAX_SCROLL_ATTEMPTS = 20
const SCROLL_RETRY_INTERVAL_MS = 250
const HIGHLIGHT_DURATION_MS = 2000

/**
 * Scrolls a product card into view, retrying while it isn't in the DOM
 * yet — covers the case where the catalog is still loading. Briefly
 * highlights the card once found so the buyer recognizes it as the
 * specific shared item.
 *
 * `onNeedMore`, if provided, is called once per failed attempt BEFORE the
 * next retry — wire this to a grid's "load next page" / "expand
 * virtualization window" trigger for lazy-loaded or infinite-scroll
 * catalogs. AlgerBot's storefront grid renders its full result set
 * directly (no pagination/virtualization) as of this writing, so this is
 * an optional hook for a future paginated grid rather than something the
 * current grid needs — but wiring the hook point here means switching to
 * a paginated grid later doesn't require touching the scroll logic again.
 */
export function useScrollToSharedProduct(productId: string | null, onNeedMore?: () => void) {
  const attemptsRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!productId) return
    attemptsRef.current = 0

    function attemptScroll() {
      const el = document.querySelector<HTMLElement>(`[data-product-id="${CSS.escape(productId!)}"]`)

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlightElement(el)
        return
      }

      attemptsRef.current += 1
      if (attemptsRef.current >= MAX_SCROLL_ATTEMPTS) {
        // Gave it a real try (20 * 250ms = 5s) — the product genuinely
        // isn't on this page (e.g. unpublished/deleted after the link was
        // shared). Give up silently rather than looping forever.
        return
      }

      onNeedMore?.()
      timeoutRef.current = setTimeout(attemptScroll, SCROLL_RETRY_INTERVAL_MS)
    }

    attemptScroll()

    // Telegram's viewportChanged event fires as the WebView's visible
    // height settles after expand() — re-running the scroll after that
    // keeps the card properly centered if the earlier scroll happened
    // against a viewport height that then changed.
    function handleViewportChanged() {
      attemptsRef.current = 0
      attemptScroll()
    }
    window.Telegram?.WebApp?.onEvent?.('viewportChanged', handleViewportChanged)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      window.Telegram?.WebApp?.offEvent?.('viewportChanged', handleViewportChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])
}

function highlightElement(el: HTMLElement) {
  const previousOutline = el.style.outline
  const previousOutlineOffset = el.style.outlineOffset
  const previousTransition = el.style.transition

  el.style.transition = 'outline-color 0.2s ease'
  el.style.outline = '3px solid var(--color-accent)'
  el.style.outlineOffset = '2px'

  setTimeout(() => {
    el.style.outline = previousOutline
    el.style.outlineOffset = previousOutlineOffset
    el.style.transition = previousTransition
  }, HIGHLIGHT_DURATION_MS)
}
