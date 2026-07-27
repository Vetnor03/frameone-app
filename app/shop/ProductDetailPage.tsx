'use client'

import Image from 'next/image'
import { useState } from 'react'
import { PlaceholderFigure, type CatalogItem } from './CatalogPage'
import { addCartItem } from './cart'
import { ShopFooter, ShopHeader } from './ShopChrome'
import { formatNok } from './productData'

type ProductDetailPageProps = {
  kind: 'frames' | 'mattes'
  item: CatalogItem
}

export default function ProductDetailPage({ kind, item }: ProductDetailPageProps) {
  const singular = kind === 'frames' ? 'frame' : 'matte'
  const [added, setAdded] = useState(false)

  function addProductToCart() {
    addCartItem({
      id: `${singular}-${item.id}-${Date.now()}`,
      productId: item.id,
      productName: item.name,
      productType: singular,
      imageSrc: item.imageSrc,
      quantity: 1,
      totalPrice: item.price,
    })
    setAdded(true)
  }

  return (
    <main className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]" style={{ marginTop: 'calc(env(safe-area-inset-top) * -1)', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-white 2xl:max-w-[1720px]">
        <ShopHeader language="en" currency="NOK" activeSection={kind} />
        <section className="mx-auto max-w-[1200px] px-6 py-8 md:py-14">
          <a href={`/shop/${kind}`} className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-black/60 hover:text-black">
            <span aria-hidden className="text-base transition-transform group-hover:-translate-x-0.5">←</span>
            All {kind}
          </a>

          <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] md:items-center md:gap-14 lg:gap-20">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#eeeae5] shadow-[0_14px_34px_rgba(0,0,0,0.08)]">
              {item.imageSrc ? (
                <Image src={item.imageSrc} alt={`${item.name} ${singular}`} fill priority className="object-cover" sizes="(min-width: 768px) 55vw, 100vw" />
              ) : (
                <PlaceholderFigure colors={item.colors} kind={kind} />
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-black/50">RE:MIND {singular}</p>
              <h1 className="mt-4 text-[38px] font-medium leading-[1.05] tracking-[0.04em] sm:text-[48px]">{item.name}</h1>
              <p className="mt-5 text-xl">{formatNok(item.price)}</p>
              <p className="mt-7 max-w-[42ch] text-[16px] leading-7 text-black/60">{item.subtitle}. Designed exclusively for RE:MIND and made to swap in seconds whenever your space calls for a new look.</p>

              <div className="mt-7 border-y border-black/10 py-5">
                <p className="text-xs font-medium uppercase tracking-[0.14em]">Finish</p>
                <div className="mt-3 flex items-center gap-3">
                  {item.colors.map((color) => <span key={color} className="h-6 w-6 rounded-full border border-black/15" style={{ backgroundColor: color }} />)}
                  <span className="text-sm text-black/55">{item.name}</span>
                </div>
              </div>

              <button type="button" onClick={addProductToCart} className="shop-button mt-8 block w-full rounded bg-black px-8 py-4 text-center text-sm font-medium tracking-[0.08em] text-white">
                ADD TO CART
              </button>
              <p className="mt-3 min-h-5 text-center text-xs leading-5 text-black/45" role="status">{added ? `${item.name} added to cart.` : `The RE:MIND display is sold separately.`}</p>
            </div>
          </div>

          <div className="mt-14 grid gap-6 border-t border-black/10 pt-9 sm:grid-cols-3 md:mt-20">
            <div><h2 className="text-xs font-medium uppercase tracking-[0.14em]">Made for RE:MIND</h2><p className="mt-2 text-sm leading-6 text-black/55">A precise fit, designed as part of the original system.</p></div>
            <div><h2 className="text-xs font-medium uppercase tracking-[0.14em]">Swap in seconds</h2><p className="mt-2 text-sm leading-6 text-black/55">Change the look without tools or replacing your display.</p></div>
            <div><h2 className="text-xs font-medium uppercase tracking-[0.14em]">Built to last</h2><p className="mt-2 text-sm leading-6 text-black/55">Durable materials chosen for everyday life at home.</p></div>
          </div>
        </section>
        <ShopFooter language="en" currency="NOK" />
      </div>
    </main>
  )
}
