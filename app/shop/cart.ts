import type { DisplayMode, ShopFrame, ShopMatte } from './productData'

export const SHOP_CART_KEY = 'remind-shop-cart-v1'
export const SHOP_CART_CHANGED = 'remind-shop-cart-changed'

export type ConfiguredCartItem = {
  id: string
  productId: 'remind'
  productName: 'RE:MIND'
  basePrice: number
  display: DisplayMode
  frame: Pick<ShopFrame, 'id' | 'name' | 'price'>
  matte: Pick<ShopMatte, 'id' | 'name' | 'price'>
  frameUpgrade: number
  matteUpgrade: number
  quantity: 1
  totalPrice: number
}

export function readCart(): ConfiguredCartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(SHOP_CART_KEY) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function addCartItem(item: ConfiguredCartItem) {
  const next = [...readCart(), item]
  window.localStorage.setItem(SHOP_CART_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(SHOP_CART_CHANGED))
}
