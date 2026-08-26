import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getShareableProductSummary } from '~/server/storefront-public'
import { buildProductTelegramLink } from '~/lib/telegram-links'
import { useLocale, LocaleProvider } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'

/**
 * This route is the "intermediary landing page" the external-preview
 * requirement effectively requires: t.me deep links do not carry any of
 * their own Open Graph metadata, so a bare
 * https://t.me/algerbot/store?startapp=<id> link pasted into WhatsApp/
 * Facebook/Messenger/Gmail shows up as an unstyled generic Telegram-domain
 * link, not a product card. This page instead:
 *   1. Serves real per-product <meta property="og:*"> tags (name, price,
 *      image) via TanStack Start's route head() - server-rendered, so
 *      link-preview crawlers (which don't execute JS) see them.
 *   2. On actual page LOAD (a human visitor, not a crawler), immediately
 *      attempts to redirect to the real t.me deep link - the "does have
 *      Telegram" fast path.
 *   3. Falls back to a plain "Open in Telegram" / "Get Telegram" prompt
 *      with the product preview visible, for anyone Telegram's own
 *      redirect chain doesn't seamlessly carry through to the Mini App.
 */
export const Route = createFileRoute('/share/product/$productId')({
  loader: async ({ params }) => {
    const product = await getShareableProductSummary({ data: { productId: params.productId } })
    return { product }
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product
    if (!product) {
      return { meta: [{ title: 'AlgerBot' }] }
    }

    const priceLabel = `${(product.priceCentimes / 100).toFixed(2)} DZD`
    const description = product.description
      ? product.description.slice(0, 200)
      : `${priceLabel} sur AlgerBot`

    return {
      meta: [
        { title: `${product.name} - AlgerBot` },
        { name: 'description', content: description },
        // Open Graph - read by WhatsApp, Facebook, Messenger's link
        // preview generator, and most email clients' preview renderers.
        { property: 'og:type', content: 'product' },
        { property: 'og:title', content: product.name },
        { property: 'og:description', content: description },
        ...(product.imageUrl ? [{ property: 'og:image', content: product.imageUrl }] : []),
        { property: 'product:price:amount', content: (product.priceCentimes / 100).toFixed(2) },
        { property: 'product:price:currency', content: 'DZD' },
        // Twitter's card tags are widely reused by other link-unfurl
        // implementations too (not just Twitter/X), cheap to include.
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: product.name },
        { name: 'twitter:description', content: description },
        ...(product.imageUrl ? [{ name: 'twitter:image', content: product.imageUrl }] : []),
      ],
    }
  },
  component: () => (
    <LocaleProvider>
      <ShareProductLandingPage />
    </LocaleProvider>
  ),
})

function ShareProductLandingPage() {
  const { product } = Route.useLoaderData()
  const { locale, t, dir } = useLocale()
  const [redirectAttempted, setRedirectAttempted] = useState(false)

  useEffect(() => {
    if (!product) return
    // Attempt the real Telegram deep link immediately. If Telegram is
    // installed, this either opens it directly or (on many mobile
    // browsers) triggers the OS's "open in app" prompt. If nothing
    // handles it, the visitor stays on this page - which is why the
    // manual "Open in Telegram" / "Get Telegram" buttons below are always
    // rendered too, not only as a delayed fallback.
    const telegramUrl = buildProductTelegramLink(product.id)
    window.location.href = telegramUrl
    setRedirectAttempted(true)
  }, [product])

  if (!product) {
    return (
      <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
        <p className="text-[var(--color-text-primary)]">
          {locale === 'ar' ? 'المنتج غير موجود' : 'Produit introuvable'}
        </p>
      </div>
    )
  }

  const telegramUrl = buildProductTelegramLink(product.id)

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center p-4" dir={dir}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="mb-4 h-48 w-full rounded-xl object-cover"
          />
        )}
        <h1 className="mb-1 text-lg font-bold text-[var(--color-text-primary)]">{product.name}</h1>
        <p className="mb-4 text-[var(--color-action-primary)] font-semibold">
          {formatDzd(product.priceCentimes, locale)}
        </p>

        <p className="mb-4 text-xs text-[var(--color-text-muted)]">{t.share.landingIntro}</p>

        <a
          href={telegramUrl}
          className="mb-2 block rounded-full bg-[var(--color-action-primary)] px-4 py-3 text-sm font-semibold text-white"
        >
          {t.share.openInTelegram}
        </a>

        <a
          href="https://telegram.org/dl"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 block text-xs text-[var(--color-text-muted)] underline"
        >
          {t.share.getTelegram}
        </a>

        <Link
          to="/s/$slug"
          params={{ slug: product.storeSlug }}
          className="text-xs text-[var(--color-text-muted)] underline"
        >
          {t.backToStore}
        </Link>

        {/* Not shown to the visitor - exists only so redirectAttempted is
            referenced, keeping this state available for any future
            debugging/analytics hook without an unused-variable warning. */}
        <span className="hidden">{redirectAttempted ? '1' : '0'}</span>
      </div>
    </div>
  )
}
