import type { Metadata } from 'next'
import { shopMetadata } from '../seo'
import { ShopFooter, ShopHeader } from '../ShopChrome'
import CartPage from './CartPage'
import { pickShopLocale } from '../productData'

export const metadata: Metadata = {
  ...shopMetadata({ title: 'Your Cart | RE:MIND', description: 'Review your RE:MIND cart.', path: '/shop/cart' }),
  robots: { index: false, follow: false },
}

export default async function ShopCartPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  return (
    <main className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]" style={{ marginTop: 'calc(env(safe-area-inset-top) * -1)', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-white 2xl:max-w-[1720px]">
        <ShopHeader language={language} />
        <CartPage language={language} />
        <ShopFooter language={language} />
      </div>
    </main>
  )
}
