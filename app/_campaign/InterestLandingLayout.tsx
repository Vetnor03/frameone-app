import type { ReactNode } from 'react'
import type { Viewport } from 'next'
import ShopRouteEffects from '../shop/ShopRouteEffects'

export const viewport: Viewport = {
  themeColor: '#f6f3ed',
}

export default function InterestLandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ShopRouteEffects routeTheme="waitlist" />
      {children}
    </>
  )
}
