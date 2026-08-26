import { Link } from '@tanstack/react-router'
import { useCart } from './CartContext'

export function CartButton({ storeSlug }: { storeSlug: string }) {
  const cart = useCart()

  return (
    <Link
      to="/s/$slug/cart"
      params={{ slug: storeSlug }}
      className="relative inline-flex items-center justify-center h-10 w-10 rounded-full bg-[var(--color-action-primary)] text-white shrink-0"
      aria-label="Panier"
    >
      🛒
      {cart.totalItems > 0 && (
        <span className="absolute -top-1 -end-1 h-5 min-w-5 rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-bold text-[var(--color-espresso)] flex items-center justify-center">
          {cart.totalItems}
        </span>
      )}
    </Link>
  )
}
