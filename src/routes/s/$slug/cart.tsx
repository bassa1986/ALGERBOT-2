import { createFileRoute, Link, getRouteApi } from '@tanstack/react-router'
import { useCart } from '~/components/storefront/CartContext'
import { useLocale } from '~/lib/i18n/LocaleContext'
import { formatDzd } from '~/lib/i18n/format'

const parentRoute = getRouteApi('/s/$slug')

export const Route = createFileRoute('/s/$slug/cart')({
  component: CartPage,
})

function CartPage() {
  const { store } = parentRoute.useLoaderData()
  const params = Route.useParams()
  const cart = useCart()
  const { locale, t } = useLocale()

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{t.cart}</h1>
        <Link to="/s/$slug" params={{ slug: params.slug }} className="text-sm text-[var(--color-text-muted)]">
          {t.backToShopping}
        </Link>
      </div>

      {cart.lines.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t.cartEmpty}</p>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {cart.lines.map((line) => (
              <div
                key={`${line.productId}-${line.variantId ?? ''}`}
                className="flex items-center gap-3 rounded-xl bg-[var(--color-surface)] p-3 shadow-sm"
              >
                {line.imageUrl && (
                  <img src={line.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--color-text-primary)] truncate">{line.name}</p>
                  {line.variantLabel && (
                    <p className="text-xs text-[var(--color-text-muted)]">{line.variantLabel}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => cart.setQuantity(line.productId, line.variantId, line.quantity - 1)}
                      className="h-6 w-6 rounded-full border border-[var(--color-border)] text-xs"
                    >
                      −
                    </button>
                    <span className="text-sm">{line.quantity}</span>
                    <button
                      onClick={() => cart.setQuantity(line.productId, line.variantId, line.quantity + 1)}
                      disabled={line.quantity >= line.maxStock}
                      className="h-6 w-6 rounded-full border border-[var(--color-border)] text-xs disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {formatDzd(line.unitPriceCentimes * line.quantity, locale)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between font-semibold text-[var(--color-text-primary)] mb-4">
            <span>{t.subtotal}</span>
            <span>{formatDzd(cart.subtotalCentimes, locale)}</span>
          </div>

          <Link
            to="/s/$slug/checkout"
            params={{ slug: store.slug }}
            className="block text-center rounded-full bg-[var(--color-action-primary)] px-4 py-3 font-semibold text-white"
          >
            {t.checkout}
          </Link>
        </>
      )}
    </div>
  )
}
