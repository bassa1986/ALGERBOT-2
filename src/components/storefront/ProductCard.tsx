import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { PublicProductCard } from '~/server/storefront-public'
import type { StoreLayoutVariant } from '~/server/store'
import { useCart } from './CartContext'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import { ShareSheet, type ShareTarget } from './ShareSheet'
import { NegotiateSheet } from './NegotiateSheet'
import {
  buildProductTelegramLink,
  buildShareableProductUrl,
  buildMerchantTelegramLink,
  type TelegramLinkConfig,
} from '~/lib/telegram-links'
import { buildMerchantWhatsAppLink } from '~/lib/whatsapp-links'

const PLACEHOLDER_SWATCH_COLORS = ['#c1502e', '#3b2417', '#e8a33d', '#8a8a8a']

/**
 * One product card, reused verbatim across all five layout variants. Only
 * the `variant` prop changes what renders inside it (swatches, stepper,
 * stock badge, list-vs-grid sizing) — this is intentionally NOT five
 * separate card components, per the "one component tree" requirement.
 */
export function ProductCard({
  product,
  storeSlug,
  variant,
  listView = false,
  telegramConfig,
  fbAppId,
  storeName,
  merchantWhatsappNumber,
  merchantTelegramUsername,
}: {
  product: PublicProductCard
  storeSlug: string
  variant: StoreLayoutVariant
  listView?: boolean
  telegramConfig: TelegramLinkConfig | null
  fbAppId: string | null
  /** Merchant's own contact channels — for the "Negotiate" button, distinct
   * from telegramConfig above (which is AlgerBot's own bot/Mini App config,
   * used for the "share this product" flow, not for contacting the merchant
   * directly). Only appears on store-page product cards (never the
   * marketplace homepage, which uses its own separate card markup) since
   * that's the only place ProductCard is ever rendered. */
  storeName: string
  merchantWhatsappNumber: string | null
  merchantTelegramUsername: string | null
}) {
  const cart = useCart()
  const [quantity, setQuantity] = useState(0)
  const { locale, t } = useLocale()

  // Each ProductCard instance owns this state independently — React gives
  // every mapped card its own component instance (keyed by product.id at
  // the call site in ProductGrid), so there is no shared/stale state
  // between cards here even though every card renders the same JSX.
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isNegotiateOpen, setIsNegotiateOpen] = useState(false)
  const [telegramMessageCopied, setTelegramMessageCopied] = useState(false)

  const hasWhatsapp = Boolean(merchantWhatsappNumber)
  const hasTelegram = Boolean(merchantTelegramUsername)

  // The message links to THIS product's dedicated share page
  // (/share/product/$id), not a raw image URL — that page already has a
  // real og:image tag (see src/routes/share/product/$productId.tsx), so
  // WhatsApp/Telegram render an actual photo preview card once this link
  // is sent. Neither wa.me nor t.me links can pre-attach a real image
  // file to the outgoing message (confirmed: no such capability exists
  // on either platform) — this is the closest real equivalent, an
  // auto-generated visual preview rather than a raw attachment.
  function buildNegotiateMessage(): string {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/share/product/${product.id}`
        : `/share/product/${product.id}`
    return `${t.negotiateMessagePrefix} "${product.name}" (${formatDzd(product.priceCentimes, locale)}) — ${storeName}\n${shareUrl}`
  }

  function handleNegotiateWhatsApp() {
    if (!merchantWhatsappNumber) return
    window.open(buildMerchantWhatsAppLink(merchantWhatsappNumber, buildNegotiateMessage()), '_blank', 'noopener,noreferrer')
    setIsNegotiateOpen(false)
  }

  async function handleNegotiateTelegram() {
    if (!merchantTelegramUsername) return
    // Telegram's official documented "prefill + share picker" pattern is
    // t.me/share/url?url=...&text=... (used elsewhere in this app, see
    // ShareSheet.tsx's handleTelegramShare) — that opens a chat PICKER,
    // not a specific person's chat directly, and is useless here anyway
    // since a buyer messaging a stranger merchant almost never already
    // has them as a saved contact to pick. For a DIRECT personal chat
    // like this one, some tools claim t.me/<username>?text=... prefills
    // the message too, but this isn't confirmed in Telegram's own
    // documented special links, so it isn't relied on here.
    //
    // Best available compromise given that real platform limitation: copy
    // the same message WhatsApp would have pre-filled to the clipboard
    // right before opening the direct chat, so the buyer pastes instead
    // of typing product name/price/link from scratch. Not literally
    // "auto-sent" — no website can make either platform send a message
    // without the buyer's own tap, on WhatsApp either — but this closes
    // the gap as far as is actually possible for Telegram.
    try {
      await navigator.clipboard.writeText(buildNegotiateMessage())
      setTelegramMessageCopied(true)
    } catch {
      // Clipboard access can fail (permissions, non-HTTPS, older
      // WebViews) — the chat still opens either way, just without the
      // copy-paste shortcut; the buyer can still type the message.
    }
    window.open(buildMerchantTelegramLink(merchantTelegramUsername), '_blank', 'noopener,noreferrer')
  }

  const isOutOfStock = product.totalStock <= 0
  const isNew = Date.now() - new Date(product.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000

  const shareTarget: ShareTarget = {
    // Absent when TELEGRAM_BOT_USERNAME/TELEGRAM_MINIAPP_SHORT_NAME
    // aren't configured on this deployment — ShareSheet hides the
    // Telegram-native option in that case rather than building a broken
    // link (see the build-time/runtime env var caveat in telegram-links.ts).
    telegramUrl: telegramConfig ? buildProductTelegramLink(telegramConfig, product.id) : undefined,
    // window is unavailable during SSR; the share button that uses this
    // only becomes interactive client-side (React hydration), so this
    // falls back to an empty string during the server render and is
    // recomputed correctly once hydrated — the share sheet is never
    // opened during SSR anyway.
    externalUrl: buildShareableProductUrl(
      typeof window !== 'undefined' ? window.location.origin : '',
      product.id,
    ),
    title: product.name,
    text: `${t.share.defaultShareText} ${product.name}`,
  }

  function handleQuickAdd(delta: number) {
    const next = Math.max(0, Math.min(quantity + delta, product.totalStock))
    setQuantity(next)
    if (delta > 0) {
      cart.addItem(
        {
          productId: product.id,
          variantId: null,
          name: product.name,
          variantLabel: null,
          unitPriceCentimes: product.priceCentimes,
          imageUrl: product.coverImageUrl,
          maxStock: product.totalStock,
        },
        1,
      )
    } else {
      cart.setQuantity(product.id, null, next)
    }
  }

  const cardContent = (
    <>
      <div
        className={`relative overflow-hidden bg-[var(--color-surface-muted)] ${
          variant === 'furniture'
            ? 'aspect-[4/3]'
            : variant === 'fashion'
              ? 'aspect-[3/4]'
              : listView
                ? 'aspect-square w-20 shrink-0 rounded-lg'
                : 'aspect-square'
        } ${listView ? '' : 'rounded-t-2xl'}`}
      >
        {product.coverImageUrl ? (
          <img
            src={product.coverImageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[var(--color-text-muted)] text-xs">
            {t.noPhoto}
          </div>
        )}

        {/* electronics: stock/availability badge directly on the card */}
        {variant === 'electronics' && (
          <span
            className={`absolute top-2 start-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isOutOfStock
                ? 'bg-[var(--color-danger)] text-white'
                : 'bg-[var(--color-success)] text-white'
            }`}
          >
            {isOutOfStock ? t.outOfStock : t.inStock}
          </span>
        )}

        {/* Recency signal, consistent with the marketplace homepage's own
            "new listing" badge — placed opposite the electronics stock
            badge (which already occupies top-start on that variant) so
            the two never collide. */}
        {isNew && (
          <span
            className={`absolute top-2 rounded-full bg-[var(--color-saffron)] px-2 py-0.5 text-[10px] font-bold text-white ${
              variant === 'electronics' ? 'end-2' : 'start-2'
            }`}
          >
            {t.newListingBadge}
          </span>
        )}

        {/* Per-card share button — reads THIS card's product_id only (via
            the closure over `product`, not any shared/global state), so
            opening the share sheet from one card can never leak another
            card's id. Positioned bottom-end so it doesn't collide with
            the electronics stock badge (top-start) or fashion swatches. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsShareOpen(true)
          }}
          data-product-id={product.id}
          aria-label={t.share.shareProduct}
          className="absolute bottom-2 end-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          <ShareIcon />
        </button>
      </div>

      <div className={`p-3 ${listView ? 'flex-1 min-w-0' : ''}`}>
        <p className="font-medium text-[var(--color-text-primary)] truncate">{product.name}</p>
        <p className="text-sm text-[var(--color-action-primary)] font-semibold">
          {formatDzd(product.priceCentimes, locale)}
        </p>

        {/* "Negotiate" — only rendered when the merchant has at least one
            contact channel configured, and only ever reachable from a
            store page (ProductCard is never used on the marketplace
            homepage, which has its own separate card markup — see
            src/routes/index.tsx). Opens NegotiateSheet (a bottom sheet
            rendered outside this card's own <Link>, see that component's
            doc comment for why — a dropdown nested inside the card was
            getting silently clipped by the card's own rounded-corner
            overflow-hidden). Picking a channel hands off to the real
            WhatsApp/Telegram app with a message linking to this product's
            share page, which carries a real photo preview once sent (see
            buildNegotiateMessage). */}
        {(hasWhatsapp || hasTelegram) && (
          <div className="relative mt-1.5" onClick={(e) => e.preventDefault()}>
            <button
              type="button"
              onClick={() => setIsNegotiateOpen((v) => !v)}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)]"
            >
              {t.negotiateButton}
            </button>
          </div>
        )}

        {/* fashion: size/color swatches visible directly on the card */}
        {variant === 'fashion' && product.hasVariants && (
          <div className="flex gap-1 mt-1.5">
            {PLACEHOLDER_SWATCH_COLORS.slice(0, 4).map((color) => (
              <span
                key={color}
                className="h-3.5 w-3.5 rounded-full border border-[var(--color-border)]"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}

        {/* furniture: dimensions/category hint line, more whitespace above it */}
        {variant === 'furniture' && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            Voir les dimensions et détails
          </p>
        )}

        {/* grocery: quantity stepper directly on the card — no need to open detail */}
        {variant === 'grocery' && (
          <div className="flex items-center gap-2 mt-2" onClick={(e) => e.preventDefault()}>
            <button
              type="button"
              disabled={quantity <= 0}
              onClick={() => handleQuickAdd(-1)}
              className="h-7 w-7 rounded-full border border-[var(--color-border)] text-sm disabled:opacity-40"
            >
              −
            </button>
            <span className="w-5 text-center text-sm text-[var(--color-text-primary)]">{quantity}</span>
            <button
              type="button"
              disabled={isOutOfStock || quantity >= product.totalStock}
              onClick={() => handleQuickAdd(1)}
              className="h-7 w-7 rounded-full bg-[var(--color-action-primary)] text-sm text-white disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      <Link
        to="/s/$slug/product/$productId"
        params={{ slug: storeSlug, productId: product.id }}
        data-product-id={product.id}
        className={
          listView
            ? 'relative flex items-center gap-3 rounded-xl bg-[var(--color-surface)] p-2 shadow-sm reveal-item'
            : 'relative block rounded-2xl bg-[var(--color-surface)] shadow-sm overflow-hidden reveal-item'
        }
      >
        {cardContent}
      </Link>

      <ShareSheet target={shareTarget} isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} fbAppId={fbAppId} />
      <NegotiateSheet
        isOpen={isNegotiateOpen}
        onClose={() => {
          setIsNegotiateOpen(false)
          setTelegramMessageCopied(false)
        }}
        hasWhatsapp={hasWhatsapp}
        hasTelegram={hasTelegram}
        onWhatsApp={handleNegotiateWhatsApp}
        onTelegram={handleNegotiateTelegram}
        telegramMessageCopied={telegramMessageCopied}
      />
    </>
  )
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </svg>
  )
}


