import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import ShopRouteEffects from './ShopRouteEffects'
import { SHOP_DESCRIPTION, shopMetadata } from './seo'
import { ENGLISH_SHOP_TITLE, NORWEGIAN_SHOP_TITLE } from './title'

export const metadata: Metadata = shopMetadata({
  title: NORWEGIAN_SHOP_TITLE,
  description: SHOP_DESCRIPTION,
  path: '/shop',
})

export const viewport: Viewport = {
  themeColor: '#f6f3ed',
}

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var l=new URLSearchParams(location.search).get('lang');document.title=l==='en'?${JSON.stringify(ENGLISH_SHOP_TITLE)}:${JSON.stringify(NORWEGIAN_SHOP_TITLE)}})()`,
        }}
      />
      <ShopRouteEffects />
      {children}
    </>
  )
}
