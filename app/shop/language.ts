export const SHOP_LANGUAGE_COOKIE = 'shop-language'

export type ShopLocale = 'en' | 'no'

export function isShopLocale(value: string | undefined | null): value is ShopLocale {
  return value === 'en' || value === 'no'
}

export function pickShopLocale(value?: string): ShopLocale {
  return isShopLocale(value) ? value : 'no'
}
