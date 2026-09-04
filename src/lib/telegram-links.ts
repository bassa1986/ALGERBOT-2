// Canonical Telegram Mini App deep-link construction.
//
// Link lifecycle this file is the foundation of:
//   1. A merchant lists a product (existing Step 4 flow) -> gets a
//      product_id (a UUID in this schema).
//   2. Merchant dashboard (buildProductTelegramLink) turns that id into
//      https://t.me/<bot>/<app>?startapp=<product_id> and copies it.
//   3. That same link format, or the per-card share menu's link (also
//      built by the functions here - one source of truth), gets shared
//      through Telegram/WhatsApp/Facebook/Messenger/Gmail/copy.
//   4. Whoever clicks it - on any platform - either lands inside the
//      Mini App WebView with start_param=<product_id> already set, or
//      lands on the OG-tagged landing page first (see /share/product/$id
//      route) if Telegram wasn't available to intercept the link.
//   5. The Mini App reads that start_param on launch (see
//      useDeepLinkRouting.ts) and routes/scrolls to the right product.
//
// IMPORTANT REAL-WORLD CAVEAT (not just an edge case):
// t.me links do NOT reliably resolve into the Mini App on every platform.
// - Telegram app installed (mobile or desktop): opens Telegram, deep-links
//   into the Mini App, start_param intact. This is the fast path.
// - Telegram NOT installed: t.me sends the visitor to the app store /
//   Telegram's download page instead. They do not land in the Mini App
//   until they install Telegram and reopen the link. There is no way to
//   change this from our app's code - it's Telegram's own redirect
//   behavior.
// - Because of that gap, the buyer-facing "Share" flow always shares a
//   URL to OUR OWN landing page (/share/product/$id), not a bare t.me
//   link. The landing page has real Open Graph tags (so WhatsApp/
//   Facebook/Messenger/Gmail previews look like a product card, not a
//   bare URL) AND immediately redirects on to the real t.me deep link for
//   visitors who do have Telegram. This is the "intermediary landing
//   page" rich-preview requirements effectively require.

function getBotUsername(): string {
  const username = import.meta.env.VITE_TELEGRAM_BOT_USERNAME
  if (!username) {
    throw new Error('VITE_TELEGRAM_BOT_USERNAME is not configured')
  }
  return username.replace(/^@/, '')
}

function getMiniAppShortName(): string {
  const shortName = import.meta.env.VITE_TELEGRAM_MINIAPP_SHORT_NAME
  if (!shortName) {
    throw new Error('VITE_TELEGRAM_MINIAPP_SHORT_NAME is not configured')
  }
  return shortName
}

/** The bare global store link: https://t.me/algerbot/store */
export function buildAppLink(): string {
  return `https://t.me/${getBotUsername()}/${getMiniAppShortName()}`
}

/**
 * The bare product deep link: https://t.me/algerbot/store?startapp=<id>.
 * Use this for the "Telegram (native)" share option specifically, since
 * Telegram's own share utility wants the real t.me link - sharing INTO
 * Telegram from Telegram never has the "Telegram isn't installed"
 * problem, so the landing-page detour isn't needed there.
 */
export function buildProductTelegramLink(productId: string): string {
  return `${buildAppLink()}?startapp=${encodeURIComponent(productId)}`
}

/**
 * The URL to hand out for every EXTERNAL channel (WhatsApp, Facebook,
 * Messenger, Gmail, plain copy-link, the Web Share API). Points at our
 * own domain's OG-tagged landing page, which immediately redirects to
 * buildProductTelegramLink() for visitors who have Telegram, and shows a
 * real product preview + "Open in Telegram" / "Get Telegram" prompt for
 * everyone else. See src/routes/share/product/$productId.tsx.
 *
 * `origin` is passed in explicitly rather than read from window.location,
 * so this function works identically from server-rendered code (the
 * merchant dashboard's server function) and client code (the buyer share
 * menu).
 */
export function buildShareableProductUrl(origin: string, productId: string): string {
  return `${origin.replace(/\/$/, '')}/share/product/${encodeURIComponent(productId)}`
}

/** Same landing-page pattern, for the global app link. */
export function buildShareableAppUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/share/app`
}

/**
 * A merchant's own personal Telegram contact link (https://t.me/<username>),
 * NOT the AlgerBot Mini App link above. Used on the public shop page so
 * buyers can message the merchant directly. telegram_username is optional
 * on the merchants table, so callers should treat a null/empty username as
 * "no button" rather than passing it here.
 */
export function buildMerchantTelegramLink(telegramUsername: string): string {
  return `https://t.me/${telegramUsername.replace(/^@/, '')}`
}
