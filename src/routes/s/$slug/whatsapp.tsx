import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { getWhatsAppContactSummary, getShareableProductSummary } from '~/server/storefront-public'
import { buildMerchantWhatsAppLink } from '~/lib/whatsapp-links'
import { LocaleProvider, useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'
import { LanguageSwitch } from '~/components/storefront/LanguageSwitch'
import { SiteNav } from '~/components/storefront/SiteNav'
import { SiteFooter } from '~/components/storefront/SiteFooter'

// A standalone landing page (no cart/header chrome from the storefront
// itself) with exactly two calls to action: chat with the merchant on
// WhatsApp, or go to the merchant's actual AlgerBot shop page. Themed to
// match the main marketplace homepage (same header pattern, same
// SiteNav/SiteFooter) rather than the per-store StorefrontHeader, since
// this page exists independently of any particular store's own branding
// (no banner/logo/layoutVariant) — it's an AlgerBot-branded contact page,
// not a themed extension of the store itself.
//
// Optionally product-scoped via ?product=<productId>: a merchant sharing
// a specific product's WhatsApp link (rather than the bare store link)
// lands buyers here with that product shown, a WhatsApp message pre-filled
// mentioning it by name, and the "visit shop" button pointing at that
// exact product's page instead of the store root.
export const Route = createFileRoute('/s/$slug/whatsapp')({
  validateSearch: (search: Record<string, unknown>) => ({
    product: typeof search.product === 'string' ? search.product : undefined,
  }),
  loader: async ({ params, deps }) => {
    const [summary, product] = await Promise.all([
      getWhatsAppContactSummary({ data: { slug: params.slug } }),
      deps.productId
        ? getShareableProductSummary({ data: { productId: deps.productId } })
        : Promise.resolve(null),
    ])
    if (!summary) throw notFound()
    // A productId that doesn't resolve (wrong id, unpublished, or
    // belongs to a different store) just falls back to the plain store
    // landing page rather than a hard 404 — the WhatsApp/shop buttons
    // still work fine without it.
    const validProduct = product && product.storeSlug === params.slug ? product : null
    return { summary, product: validProduct }
  },
  loaderDeps: ({ search }) => ({ productId: search.product }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product?.name ?? loaderData.summary.storeName} — AlgerBot` },
          { property: 'og:type', content: 'website' },
          { property: 'og:title', content: loaderData.product?.name ?? loaderData.summary.storeName },
        ]
      : [],
  }),
  component: () => (
    <LocaleProvider>
      <WhatsAppContactPage />
    </LocaleProvider>
  ),
})

function WhatsAppContactPage() {
  const { summary, product } = Route.useLoaderData()
  const { t, dir, locale } = useLocale()

  const prefillText = product
    ? `${t.share.defaultShareText} — ${product.name} (${formatDzd(product.priceCentimes, locale)}) — ${summary.storeName}`
    : `${t.share.defaultShareText} — ${summary.storeName}`

  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)]" dir={dir}>
      <header className="flex items-center justify-between p-4">
        <div className="flex-1" />
        <div className="text-center">
          <h1 className="app-title text-2xl font-bold text-[var(--color-text-primary)]">{t.appName}</h1>
          <p className="text-base font-extrabold text-[var(--color-text-muted)]">{t.appTagline}</p>
        </div>
        <div className="flex-1 flex justify-end">
          <LanguageSwitch />
        </div>
      </header>

      <SiteNav />

      <main className="flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
          {product ? (
            <>
              {product.imageUrl && (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="mx-auto mb-4 h-32 w-32 rounded-xl object-cover border border-[var(--color-border)]"
                />
              )}
              <h2 className="mb-1 text-lg font-bold text-[var(--color-text-primary)]">{product.name}</h2>
              <p className="mb-1 text-sm font-semibold text-[var(--color-action-primary)]">
                {formatDzd(product.priceCentimes, locale)}
              </p>
              <p className="mb-6 text-xs text-[var(--color-text-muted)]">{summary.storeName}</p>
            </>
          ) : (
            <>
              {summary.logoUrl && (
                <img
                  src={summary.logoUrl}
                  alt={summary.storeName}
                  className="mx-auto mb-4 h-16 w-16 rounded-full object-cover border border-[var(--color-border)]"
                />
              )}
              <h2 className="mb-1 text-lg font-bold text-[var(--color-text-primary)]">{summary.storeName}</h2>
              <p className="mb-6 text-sm text-[var(--color-text-muted)]">{t.whatsappLandingIntro}</p>
            </>
          )}

          {summary.whatsappNumber && (
            <a
              href={buildMerchantWhatsAppLink(summary.whatsappNumber, prefillText)}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 block rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white"
            >
              {t.visitMerchantWhatsApp}
            </a>
          )}

          {product ? (
            <Link
              to="/s/$slug/product/$productId"
              params={{ slug: summary.storeSlug, productId: product.id }}
              className="block rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]"
            >
              {t.viewProduct}
            </Link>
          ) : (
            <Link
              to="/s/$slug"
              params={{ slug: summary.storeSlug }}
              className="block rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)]"
            >
              {t.visitOurShop}
            </Link>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
