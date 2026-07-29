import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import ShopRouteEffects from './ShopRouteEffects'
import ShopLocaleBridge from './ShopLocaleBridge'
import { SHOP_DESCRIPTION, shopMetadata } from './seo'

export const metadata: Metadata = shopMetadata({
  title: 'RE:MIND | What matters. Beautifully displayed.',
  description: SHOP_DESCRIPTION,
  path: '/shop',
})

export const viewport: Viewport = {
  themeColor: '#f6f3ed',
}

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ShopRouteEffects />
      <ShopLocaleBridge />
      {children}
    </>
  )
}
