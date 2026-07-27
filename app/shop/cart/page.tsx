import type { Metadata } from 'next'
import { ShopFooter, ShopHeader } from '../ShopChrome'
import CartPage from './CartPage'

export const metadata: Metadata = {
  title: 'Your cart | RE:MIND',
  description: 'Review your RE:MIND cart.',
}

export default function ShopCartPage() {
  return (
    <main className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]" style={{ marginTop: 'calc(env(safe-area-inset-top) * -1)', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-white 2xl:max-w-[1720px]">
        <ShopHeader language="en" />
        <CartPage />
        <ShopFooter language="en" />
      </div>
    </main>
  )
}
