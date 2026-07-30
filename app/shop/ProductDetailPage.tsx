'use client'

import Image from 'next/image'
import { useState } from 'react'
import { PlaceholderFigure, type CatalogItem } from './CatalogPage'
import { addCartItem } from './cart'
import { ShopFooter, ShopHeader } from './ShopChrome'
import FrameFavouriteButton from './FrameFavouriteButton'
import { availabilityDisplayLabel, formatNok, frameDisplayName, frameDisplaySubtitle, matteDisplayName, matteDisplaySubtitle, type ShopLocale } from './productData'

type ProductDetailPageProps = {
  kind: 'frames' | 'mattes'
  item: CatalogItem
  language: ShopLocale
}

export default function ProductDetailPage({ kind, item, language }: ProductDetailPageProps) {
  const displayName = kind === 'frames' ? frameDisplayName(item.id, item.name, language) : matteDisplayName(item.id, item.name, language)
  const displaySubtitle = kind === 'frames' ? frameDisplaySubtitle(item.id, item.subtitle, language) : matteDisplaySubtitle(item.id, item.subtitle, language)
  const singular = kind === 'frames' ? 'frame' : 'matte'
  const isNorwegianFrame = kind === 'frames' && language === 'no'
  const isNorwegianMatte = kind === 'mattes' && language === 'no'
  const [added, setAdded] = useState(false)
  const comingSoon = item.availability === 'coming-soon'

  function addProductToCart() {
    if (comingSoon) return
    addCartItem({
      id: `${singular}-${item.id}-${Date.now()}`,
      productId: item.id,
      productName: item.name,
      productType: singular,
      imageSrc: item.imageSrc,
      colors: item.colors,
      quantity: 1,
      totalPrice: item.price,
    })
    setAdded(true)
  }

  return (
    <main className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]" style={{ marginTop: 'calc(env(safe-area-inset-top) * -1)', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-white 2xl:max-w-[1720px]">
        <ShopHeader language={language} activeSection={kind} />
        <section className="mx-auto max-w-[1200px] px-6 py-8 md:py-14">
          <a href={`/shop/${kind}?lang=${language}`} className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-black/60 hover:text-black">
            <span aria-hidden className="text-base transition-transform group-hover:-translate-x-0.5">←</span>
            {isNorwegianFrame ? 'ALLE RAMMER' : isNorwegianMatte ? 'ALLE INNLEGG' : `All ${kind}`}
          </a>

          <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] md:items-center md:gap-14 lg:gap-20">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#eeeae5] shadow-[0_14px_34px_rgba(0,0,0,0.08)]">
              {item.imageSrc ? (
                <Image src={item.imageSrc} alt={`${displayName} ${singular}`} fill priority className="object-cover" sizes="(min-width: 768px) 55vw, 100vw" />
              ) : (
                <PlaceholderFigure colors={item.colors} kind={kind} />
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-black/50">{isNorwegianFrame ? 'RAMME TIL RE:MIND' : isNorwegianMatte ? 'INNLEGG TIL RE:MIND' : `RE:MIND ${singular}`}</p>
              {item.availability && item.availability !== 'in-stock' && <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.16em] text-black/50" aria-label={`Availability: ${availabilityDisplayLabel(item.availability, language)}`}>{availabilityDisplayLabel(item.availability, language)}</p>}
              <h1 className="mt-4 text-[38px] font-medium leading-[1.05] tracking-[0.04em] sm:text-[48px]">{displayName}</h1>
              <p className="mt-5 text-xl">{formatNok(item.price, language)}</p>
              <p className="mt-7 max-w-[42ch] text-[16px] leading-7 text-black/60">{displaySubtitle}. {language === 'no' ? 'Utviklet spesielt for RE:MIND og kan byttes på sekunder når du ønsker et nytt uttrykk.' : 'Designed exclusively for RE:MIND and made to swap in seconds whenever your space calls for a new look.'}</p>

              <div className="mt-7 border-y border-black/10 py-5">
                <p className="text-xs font-medium uppercase tracking-[0.14em]">{language === 'no' ? 'UTFØRELSE' : 'Finish'}</p>
                <div className="mt-3 flex items-center gap-3">
                  {item.colors.map((color) => <span key={color} className="h-6 w-6 rounded-full border border-black/15" style={{ backgroundColor: color }} />)}
                  <span className="text-sm text-black/55">{displayName}</span>
                </div>
              </div>

              {comingSoon ? (
                <div className="mt-8 flex items-center justify-between gap-4 border-y border-black/10 py-2">
                  <p className="text-xs uppercase leading-5 tracking-[0.12em] text-black/55">Heart this {singular} to help choose what comes next.</p>
                  <FrameFavouriteButton frameId={item.id} frameName={item.name} />
                </div>
              ) : <button type="button" onClick={addProductToCart} className="shop-button mt-8 block w-full rounded bg-black px-8 py-4 text-center text-sm font-medium tracking-[0.08em] text-white">{language === 'no' ? 'LEGG I HANDLEKURV' : 'ADD TO CART'}</button>}
              <p className="mt-3 min-h-5 text-center text-xs leading-5 text-black/45" role="status">{added ? `${displayName} added to cart.` : comingSoon ? 'Not yet available to purchase.' : language === 'no' ? 'RE:MIND-enheten selges separat.' : `The RE:MIND display is sold separately.`}</p>
            </div>
          </div>

          <div className="mt-14 grid gap-6 border-t border-black/10 pt-9 sm:grid-cols-3 md:mt-20">
            <div><h2 className="text-xs font-medium uppercase tracking-[0.14em]">{language === 'no' ? 'UTVIKLET FOR RE:MIND' : 'Made for RE:MIND'}</h2><p className="mt-2 text-sm leading-6 text-black/55">{language === 'no' ? 'Presis passform, utviklet som en del av RE:MIND-systemet.' : 'A precise fit, designed as part of the original system.'}</p></div>
            <div><h2 className="text-xs font-medium uppercase tracking-[0.14em]">{isNorwegianFrame ? 'BYTT PÅ SEKUNDER' : isNorwegianMatte ? 'NYTT UTTRYKK PÅ SEKUNDER' : 'Swap in seconds'}</h2><p className="mt-2 text-sm leading-6 text-black/55">{isNorwegianFrame ? 'Bytt ramme og uttrykk på sekunder – helt uten verktøy.' : isNorwegianMatte ? 'Bytt innlegg og uttrykk på sekunder – helt uten verktøy.' : 'Change the look without tools or replacing your display.'}</p></div>
            <div><h2 className="text-xs font-medium uppercase tracking-[0.14em]">{language === 'no' ? 'LAGET FOR Å VARE' : 'Built to last'}</h2><p className="mt-2 text-sm leading-6 text-black/55">{language === 'no' ? 'Holdbare materialer, valgt for å tåle hverdagen.' : 'Durable materials chosen for everyday life at home.'}</p></div>
          </div>
        </section>
        <ShopFooter language={language} />
      </div>
    </main>
  )
}
