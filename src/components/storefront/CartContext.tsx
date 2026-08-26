import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { hapticImpact } from '~/lib/telegram-webapp.browser'

export interface CartLine {
  productId: string
  variantId: string | null
  name: string
  variantLabel: string | null
  unitPriceCentimes: number
  quantity: number
  imageUrl: string | null
  maxStock: number
}

interface CartContextValue {
  lines: CartLine[]
  addItem: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void
  setQuantity: (productId: string, variantId: string | null, quantity: number) => void
  removeItem: (productId: string, variantId: string | null) => void
  clear: () => void
  totalItems: number
  subtotalCentimes: number
}

const CartContext = createContext<CartContextValue | null>(null)

function lineKey(productId: string, variantId: string | null): string {
  return `${productId}::${variantId ?? ''}`
}

/**
 * One cart per storefront visit — per spec ("per-merchant cart"), a buyer
 * shopping across two different stores' storefronts in the same session
 * would naturally get two independent carts. This provider is mounted once
 * per storefront route tree ($slug), so its state is scoped to that store
 * for the lifetime of the tab; nothing here is persisted across a reload,
 * matching the guest-checkout, no-account model.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])

  const addItem: CartContextValue['addItem'] = (line, quantity = 1) => {
    hapticImpact('light')
    setLines((prev) => {
      const key = lineKey(line.productId, line.variantId)
      const existing = prev.find((l) => lineKey(l.productId, l.variantId) === key)
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, line.maxStock)
        return prev.map((l) => (lineKey(l.productId, l.variantId) === key ? { ...l, quantity: newQty } : l))
      }
      return [...prev, { ...line, quantity: Math.min(quantity, line.maxStock) }]
    })
  }

  const setQuantity: CartContextValue['setQuantity'] = (productId, variantId, quantity) => {
    setLines((prev) => {
      const key = lineKey(productId, variantId)
      if (quantity <= 0) return prev.filter((l) => lineKey(l.productId, l.variantId) !== key)
      return prev.map((l) =>
        lineKey(l.productId, l.variantId) === key ? { ...l, quantity: Math.min(quantity, l.maxStock) } : l,
      )
    })
  }

  const removeItem: CartContextValue['removeItem'] = (productId, variantId) => {
    setLines((prev) => prev.filter((l) => lineKey(l.productId, l.variantId) !== lineKey(productId, variantId)))
  }

  const clear = () => setLines([])

  const totalItems = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines])
  const subtotalCentimes = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPriceCentimes * l.quantity, 0),
    [lines],
  )

  return (
    <CartContext.Provider value={{ lines, addItem, setQuantity, removeItem, clear, totalItems, subtotalCentimes }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
