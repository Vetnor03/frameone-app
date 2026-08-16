'use client'

import { track } from '@vercel/analytics'

export const SHOP_CURRENCY = 'NOK' as const
export const REMIND_BASE_PRICE = 2299 as const

type Availability = 'in-stock' | 'low-stock' | 'out-of-stock' | 'exploring'

export type ShopAnalyticsEvents = {
  shop_view: Record<string, never>
  product_view: { product: 'RE:MIND'; base_price: typeof REMIND_BASE_PRICE; currency: typeof SHOP_CURRENCY }
  configurator_open: { product: 'RE:MIND' }
  frame_selected: { frame_id: string; frame_name: string; availability: Availability; price_delta: number }
  matte_selected: { matte_id: string; matte_name: string; availability: Availability; price_delta: number }
  add_to_cart: {
    product: 'RE:MIND'
    frame_id: string
    frame_name: string
    matte_id: string
    matte_name: string
    total_price: number
    currency: typeof SHOP_CURRENCY
  }
  cart_view: { item_count: number; cart_total: number; currency: typeof SHOP_CURRENCY }
  begin_checkout: { item_count: number; cart_total: number; currency: typeof SHOP_CURRENCY }
}

export type ShopEventName = keyof ShopAnalyticsEvents

/**
 * The shop's only analytics boundary. Vercel Web Analytics is cookieless, and
 * custom events are limited to production so local development and tests never
 * pollute reporting. `begin_checkout` is typed for the future Shopify handoff
 * but must not be emitted until that handoff is real. Purchase tracking belongs
 * on a verified order/confirmation source, not in this client helper.
 */
export function trackShopEvent<Name extends ShopEventName>(name: Name, properties: ShopAnalyticsEvents[Name]) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production') return
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return

  track(name, properties)
}
