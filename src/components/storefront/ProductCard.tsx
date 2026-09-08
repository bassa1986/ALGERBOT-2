import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { PublicProductCard } from '~/server/storefront-public'
import type { StoreLayoutVariant } from '~/server/store'
import { useCart } from './CartContext'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import { ShareSheet, type ShareTarget } from './ShareSheet'
import { NegotiateSheet } from './NegotiateSheet'
import { buildProductTelegramLink, buildShareableProductUrl, type TelegramLinkConfig } from '~/lib/telegram-links'

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
  /** Kept as a prop for call-site compatibility; no longer read inside
   * this component now that "Negotiate" is a real in-page chat
   * (NegotiateSheet/src/server/negotiation.ts) rather than a hand-off
   * message that needed to mention the store by name. Harmless to leave
   * unused rather than touch every ProductCard call site to remove it. */
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

  const hasWhatsapp = Boolean(merchantWhatsappNumber)
  const hasTelegram = Boolean(merchantTelegramUsername)

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
            src/routes/index.tsx). Opens NegotiateSheet: a real in-page
            chat, not a hand-off — see that component's and
            src/server/negotiation.ts's doc comments for the full design
            (messages relay to the merchant's real WhatsApp/Telegram, and
            their replies relay back in via polling). Also see
            NegotiateSheet's comment for why it's rendered as a sibling
            of this card's own <Link>, not a descendant of it. */}
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
        onClose={() => setIsNegotiateOpen(false)}
        hasWhatsapp={hasWhatsapp}
        hasTelegram={hasTelegram}
        storeSlug={storeSlug}
        productId={product.id}
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


