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
  quantity: number
  totalPrice: number
}

export type StandaloneCartItem = {
  id: string
  productId: string
  productName: string
  productType: 'frame' | 'matte'
  imageSrc?: string
  colors?: [string, string]
  quantity: number
  totalPrice: number
}

export type CartItem = ConfiguredCartItem | StandaloneCartItem

export function isConfiguredCartItem(item: CartItem): item is ConfiguredCartItem {
  return item.productId === 'remind'
}

export function readCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(SHOP_CART_KEY) ?? '[]')
    return Array.isArray(value)
      ? value.map((item) => ({ ...item, quantity: Number.isFinite(item?.quantity) && item.quantity > 0 ? Math.floor(item.quantity) : 1 }))
      : []
  } catch {
    return []
  }
}

export function addCartItem(item: CartItem) {
  const items = readCart()
  const matchingItem = items.find((existing) => {
    if (isConfiguredCartItem(existing) && isConfiguredCartItem(item)) {
      return existing.display === item.display
        && existing.frame.id === item.frame.id
        && existing.matte.id === item.matte.id
    }
    return !isConfiguredCartItem(existing) && !isConfiguredCartItem(item)
      && existing.productId === item.productId
      && existing.productType === item.productType
  })

  if (matchingItem) {
    const addedQuantity = Number.isFinite(item.quantity) ? Math.max(1, Math.floor(item.quantity)) : 1
    updateCartItemQuantity(matchingItem.id, matchingItem.quantity + addedQuantity)
    return
  }

  writeCart([...items, item])
}

function writeCart(items: CartItem[]) {
  window.localStorage.setItem(SHOP_CART_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(SHOP_CART_CHANGED))
}

export function updateCartItemQuantity(id: string, quantity: number) {
  const safeQuantity = Number.isFinite(quantity) ? Math.max(1, Math.min(99, Math.floor(quantity))) : 1
  writeCart(readCart().map((item) => item.id === id ? { ...item, quantity: safeQuantity } : item))
}

export function removeCartItem(id: string) {
  writeCart(readCart().filter((item) => item.id !== id))
}
