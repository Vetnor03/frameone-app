import type { ReactNode } from 'react'
import type { Viewport } from 'next'
import ShopRouteEffects from './ShopRouteEffects'
import VercelAnalytics from './VercelAnalytics'

export const viewport: Viewport = {
  themeColor: '#f6f3ed',
}

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ShopRouteEffects />
      {children}
      <VercelAnalytics />
    </>
  )
}
