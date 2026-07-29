'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { REMIND_BASE_PRICE, SHOP_CURRENCY, trackShopEvent } from './analytics'

const SHOP_THEME_COLOR = '#f6f3ed'

type ShopRouteEffectsProps = {
  routeTheme?: 'shop' | 'waitlist'
}

export default function ShopRouteEffects({ routeTheme = 'shop' }: ShopRouteEffectsProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/shop') {
      trackShopEvent('shop_view', {})
      trackShopEvent('product_view', { product: 'RE:MIND', base_price: REMIND_BASE_PRICE, currency: SHOP_CURRENCY })
    } else if (pathname === '/shop/configure') {
      trackShopEvent('configurator_open', { product: 'RE:MIND' })
    }
  }, [pathname])

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const originalRouteTheme = html.dataset.routeTheme
    const originalBodyBackground = body.style.backgroundColor

    html.dataset.routeTheme = routeTheme
    body.style.backgroundColor = SHOP_THEME_COLOR

    let metaTheme = document.querySelector('meta[name="theme-color"]')

    if (!metaTheme) {
      metaTheme = document.createElement('meta')
      metaTheme.setAttribute('name', 'theme-color')
      document.head.appendChild(metaTheme)
    }

    const previousThemeContent = metaTheme.getAttribute('content')
    metaTheme.setAttribute('content', SHOP_THEME_COLOR)

    return () => {
      if (originalRouteTheme) {
        html.dataset.routeTheme = originalRouteTheme
      } else {
        delete html.dataset.routeTheme
      }

      body.style.backgroundColor = originalBodyBackground

      if (previousThemeContent) {
        metaTheme?.setAttribute('content', previousThemeContent)
      }
    }
  }, [routeTheme])

  return null
}
