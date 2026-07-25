import Image from 'next/image'
import type { Metadata } from 'next'
import Configurator from './Configurator'
import ShopCartCount from '../ShopCartCount'
import ShopLocaleCurrencySelector from '../ShopLocaleCurrencySelector'
import { formatNok } from '../productData'

export const metadata: Metadata = {
  title: 'Build your RE:MIND',
  description: 'Configure your RE:MIND frame and matte.',
}

function pickLang(value?: string): 'en' | 'no' { return value === 'no' ? 'no' : 'en' }

export default async function ConfigurePage({ searchParams }: { searchParams?: Promise<{ lang?: string; currency?: string }> }) {
  const params = await searchParams
  const language = pickLang(params?.lang)
  const currency = 'NOK' as const
  const shopHref = `/shop?lang=${language}&currency=${currency}`

  return (
    <main className="shop-page min-h-screen overflow-x-hidden bg-white text-[#141414]">
      <div className="bg-[#0b0d10] text-[11px] text-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-4 py-2 tracking-[0.02em] sm:gap-5 sm:px-6">
          <span>{language === 'no' ? `Gratis frakt over ${formatNok(1000)}` : `Free shipping over ${formatNok(1000)}`}</span><span className="h-3 w-px bg-white/35" aria-hidden /><span>30 day returns</span><span className="h-3 w-px bg-white/35" aria-hidden /><span>2 year warranty</span>
        </div>
      </div>
      <header className="border-b border-black/10 bg-[#faf9f7]">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-6 md:px-14">
          <a href={shopHref} className="text-[25px] font-medium tracking-[0.28em] sm:text-[29px]">RE:MIND</a>
          <button type="button" aria-label="Open shopping cart" className="shop-icon-button relative inline-flex items-center justify-center p-1 text-black/75">
            <Image src="/shop/icons/header/cart.png" alt="" aria-hidden width={44} height={44} className="h-11 w-11 object-contain" />
            <ShopCartCount />
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-[1200px] px-6 pt-7">
        <a href={shopHref} className="text-sm text-black/60 outline-none hover:text-black focus-visible:ring-1 focus-visible:ring-black">← Back to shop</a>
      </div>
      <Configurator />
      <footer className="border-t border-black/10 bg-[#faf9f7]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6 text-xs text-black/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Re-mind. All rights reserved.</p>
          <ShopLocaleCurrencySelector language={language} currency={currency} />
        </div>
      </footer>
    </main>
  )
}
