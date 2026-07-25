'use client'

import { useState } from 'react'
import { addCartItem } from '../cart'
import { combinationAt, combinationIndex, configurationTotal, cycleCombination } from '../configuratorLogic'
import { formatNok, remindProduct, shopFrames, shopMattes } from '../productData'

function PreviewLayer({ src, alt, layer }: { src: string; alt: string; layer: 'device' | 'matte' | 'frame' }) {
  const [visible, setVisible] = useState(false)
  const zIndex = layer === 'device' ? 10 : layer === 'matte' ? 20 : 30
  return (
    // Plain img is intentional: missing future layer assets are hidden cleanly on error.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onLoad={() => setVisible(true)}
      onError={() => setVisible(false)}
      className="absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
      style={{ zIndex, opacity: visible ? 1 : 0 }}
    />
  )
}

export default function Configurator() {
  const [frameId, setFrameId] = useState(shopFrames[0].id)
  const [matteId, setMatteId] = useState(shopMattes[0].id)
  const [added, setAdded] = useState(false)
  const frame = shopFrames.find((item) => item.id === frameId) ?? shopFrames[0]
  const matte = shopMattes.find((item) => item.id === matteId) ?? shopMattes[0]
  const frameIndex = shopFrames.findIndex((item) => item.id === frame.id)
  const matteIndex = shopMattes.findIndex((item) => item.id === matte.id)
  const currentCombination = combinationIndex(frameIndex, matteIndex, shopMattes.length)
  const total = configurationTotal(remindProduct.price, frame.price, matte.price)

  function cycle(direction: 1 | -1) {
    const index = cycleCombination(currentCombination, direction, shopFrames.length * shopMattes.length)
    const next = combinationAt(index, shopFrames, shopMattes)
    setFrameId(next.frame.id)
    setMatteId(next.matte.id)
    setAdded(false)
  }

  function addConfiguration() {
    addCartItem({
      id: `remind-${frame.id}-${matte.id}-${Date.now()}`,
      productId: 'remind',
      productName: 'RE:MIND',
      basePrice: remindProduct.price,
      frame: { id: frame.id, name: frame.name, price: frame.price },
      matte: { id: matte.id, name: matte.name, price: matte.price },
      quantity: 1,
      totalPrice: total,
    })
    setAdded(true)
  }

  return (
    <>
      <section className="border-b border-black/10 bg-[#faf9f7]">
        <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-10 sm:px-6 md:pb-12 md:pt-14">
          <div className="text-center">
            <h1 className="text-[30px] font-medium tracking-[0.12em] sm:text-[38px]">BUILD YOUR RE:MIND</h1>
            <p className="mt-3 text-[16px] text-black/60">Find the combination that feels like home.</p>
          </div>

          <div className="relative mt-7 md:mt-10">
            <div className="relative mx-auto aspect-[16/9] w-full" aria-live="polite" aria-label={`${frame.name} frame with ${matte.name}`}>
              {/* Stable fallback remains beneath all future transparent layers. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={remindProduct.fallbackPreviewSrc} alt="RE:MIND device preview" className="absolute inset-0 h-full w-full object-contain" />
              <PreviewLayer src={remindProduct.devicePreviewSrc} alt="" layer="device" />
              <PreviewLayer key={matte.id} src={matte.configuratorPreviewSrc} alt="" layer="matte" />
              <PreviewLayer key={frame.id} src={frame.configuratorPreviewSrc} alt="" layer="frame" />
            </div>
            <button type="button" aria-label="Previous combination" onClick={() => cycle(-1)} className="absolute left-0 top-1/2 z-40 flex h-14 w-12 -translate-y-1/2 items-center justify-center text-5xl font-light text-black/55 outline-none focus-visible:ring-1 focus-visible:ring-black sm:left-3 md:h-20 md:w-16 md:text-6xl">‹</button>
            <button type="button" aria-label="Next combination" onClick={() => cycle(1)} className="absolute right-0 top-1/2 z-40 flex h-14 w-12 -translate-y-1/2 items-center justify-center text-5xl font-light text-black/55 outline-none focus-visible:ring-1 focus-visible:ring-black sm:right-3 md:h-20 md:w-16 md:text-6xl">›</button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-10 md:py-14">
        <div className="grid gap-7 border-b border-black/10 pb-10 md:grid-cols-2 md:gap-12">
          <label className="block text-xs font-medium tracking-[0.15em]">
            FRAME
            <span className="relative mt-3 block">
              <select value={frame.id} onChange={(event) => { setFrameId(event.target.value); setAdded(false) }} className="w-full appearance-none border-b border-black/30 bg-transparent py-3 pr-28 text-lg tracking-normal outline-none focus-visible:border-black">
                {shopFrames.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-8 top-3 text-sm tracking-normal">+{formatNok(frame.price)}</span>
              <span className="pointer-events-none absolute right-0 top-3 text-base">⌄</span>
            </span>
          </label>
          <label className="block text-xs font-medium tracking-[0.15em]">
            MATTE
            <span className="relative mt-3 block">
              <select value={matte.id} onChange={(event) => { setMatteId(event.target.value); setAdded(false) }} className="w-full appearance-none border-b border-black/30 bg-transparent py-3 pr-28 text-lg tracking-normal outline-none focus-visible:border-black">
                {shopMattes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-8 top-3 text-sm tracking-normal">{matte.price === null ? 'Price pending' : `+${formatNok(matte.price)}`}</span>
              <span className="pointer-events-none absolute right-0 top-3 text-base">⌄</span>
            </span>
          </label>
        </div>

        <div className="mx-auto mt-10 max-w-[620px]">
          <dl className="space-y-3 text-[15px]">
            <div className="flex justify-between gap-6"><dt>RE:MIND</dt><dd>{formatNok(remindProduct.price)}</dd></div>
            <div className="flex justify-between gap-6"><dt>{frame.name}</dt><dd>{formatNok(frame.price)}</dd></div>
            <div className="flex justify-between gap-6"><dt>{matte.name}</dt><dd>{matte.price === null ? 'Price pending' : formatNok(matte.price)}</dd></div>
            <div className="mt-5 flex justify-between gap-6 border-t border-black/20 pt-5 text-lg font-medium"><dt>TOTAL</dt><dd>{total === null ? 'Pending matte price' : formatNok(total)}</dd></div>
          </dl>
          <button type="button" onClick={addConfiguration} className="shop-button mt-9 w-full rounded bg-black px-8 py-4 text-sm font-medium tracking-[0.08em] text-white">ADD TO CART</button>
          <p className="mt-3 min-h-5 text-center text-sm text-black/60" role="status">{added ? 'Configuration added to cart.' : ''}</p>
        </div>
      </section>
    </>
  )
}
