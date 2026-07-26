'use client'

import { useState, type CSSProperties } from 'react'
import { addCartItem } from '../cart'
import { combinationAt, combinationIndex, configurationTotal, cycleCombination, optionUpgrade } from '../configuratorLogic'
import { displayOptions, formatNok, remindProduct, shopFrames, shopMattes, type DisplayMode } from '../productData'

const frameAppearances: Record<string, CSSProperties> = {
  'midnight-black': { background: '#181817' },
  metal: { background: '#a7a8a5' },
  'natural-oak': { background: '#c79a68' },
  'walnut-wood': { background: '#684635' },
  'cloud-white': { background: '#e9e9e5' },
  'custom-friends': { background: 'linear-gradient(135deg, #d7a07b, #a6b7a0)' },
  'custom-grinch': { background: 'linear-gradient(135deg, #72835c, #b4483f)' },
  'custom-snoopy': { background: 'linear-gradient(135deg, #eee9dc, #6788a1)' },
}

const matteAppearances: Record<string, CSSProperties> = {
  beige: { background: '#eee5d3' },
  black: { background: '#292927' },
  'black-white': { background: 'linear-gradient(135deg, #30302e 0 50%, #f0eee7 50%)' },
  brown: { background: '#8b6f59' },
  green: { background: '#87917a' },
  white: { background: '#f4f2eb' },
  'white-black': { background: 'linear-gradient(135deg, #f0eee7 0 50%, #30302e 50%)' },
  'custom-friends': { background: '#d9b69e' },
  'custom-grinch': { background: '#a7b18a' },
  'custom-snoopy': { background: '#bdcbd2' },
}

function FramePlaceholder({ frameId }: { frameId: string }) {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-[8%] rounded-[0.35rem] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12),inset_0_0_1.15rem_rgba(0,0,0,0.3),0_0.35rem_0.75rem_rgba(0,0,0,0.14)] transition-colors duration-200"
      style={frameAppearances[frameId]}
    >
      <span className="absolute inset-[2.25%] rounded-[0.24rem] border border-black/25 bg-gradient-to-br from-white/10 via-transparent to-black/20" />
    </span>
  )
}

function MattePlaceholder({ matteId }: { matteId: string }) {
  return <span aria-hidden="true" className="absolute inset-x-[24%] inset-y-[25%] rounded-[0.1rem] shadow-[0_0_0_1px_rgba(0,0,0,0.1)] transition-colors duration-200" style={matteAppearances[matteId]} />
}

function DevicePlaceholder({ display }: { display: DisplayMode }) {
  const light = display === 'light'
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-[28%] inset-y-[29%] flex items-center justify-center rounded-[0.15rem] border border-black/20 transition-colors duration-200"
      style={{ background: light ? '#dddcd5' : '#242423', color: light ? '#292927' : '#f2f0e9' }}
    >
      <span className="text-[clamp(0.45rem,1.3vw,0.9rem)] font-medium tracking-[0.22em]">RE:MIND</span>
    </span>
  )
}

export default function Configurator() {
  const [frameId, setFrameId] = useState(shopFrames[0].id)
  const [matteId, setMatteId] = useState(shopMattes[0].id)
  const [selectedDisplay, setSelectedDisplay] = useState<DisplayMode>('dark')
  const [added, setAdded] = useState(false)
  const frame = shopFrames.find((item) => item.id === frameId) ?? shopFrames[0]
  const matte = shopMattes.find((item) => item.id === matteId) ?? shopMattes[0]
  const display = displayOptions.find((item) => item.id === selectedDisplay) ?? displayOptions[0]
  const frameIndex = shopFrames.findIndex((item) => item.id === frame.id)
  const matteIndex = shopMattes.findIndex((item) => item.id === matte.id)
  const currentCombination = combinationIndex(frameIndex, matteIndex, shopMattes.length)
  const frameUpgrade = optionUpgrade(frame.price, shopFrames.map((item) => item.price))
  const matteUpgrade = optionUpgrade(matte.price, shopMattes.map((item) => item.price))
  const total = configurationTotal(remindProduct.price, frameUpgrade, matteUpgrade)

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
      display: selectedDisplay,
      frame: { id: frame.id, name: frame.name, price: frame.price },
      matte: { id: matte.id, name: matte.name, price: matte.price },
      frameUpgrade,
      matteUpgrade,
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
            <div className="relative mx-auto aspect-[16/9] w-full max-w-[960px]" aria-live="polite" aria-label={`${frame.name} frame with ${matte.name} matte and ${display.name.toLowerCase()} display`}>
              <FramePlaceholder frameId={frame.id} />
              <MattePlaceholder matteId={matte.id} />
              <DevicePlaceholder display={display.id} />
            </div>
            <button type="button" aria-label="Previous combination" onClick={() => cycle(-1)} className="absolute left-0 top-1/2 z-40 flex h-14 w-12 -translate-y-1/2 items-center justify-center text-5xl font-light text-black/55 outline-none focus-visible:ring-1 focus-visible:ring-black sm:left-3 md:h-20 md:w-16 md:text-6xl">‹</button>
            <button type="button" aria-label="Next combination" onClick={() => cycle(1)} className="absolute right-0 top-1/2 z-40 flex h-14 w-12 -translate-y-1/2 items-center justify-center text-5xl font-light text-black/55 outline-none focus-visible:ring-1 focus-visible:ring-black sm:right-3 md:h-20 md:w-16 md:text-6xl">›</button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-10 md:py-14 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.75fr)] lg:gap-16 lg:py-16">
        <div className="grid gap-7 border-b border-black/10 pb-10 md:grid-cols-2 md:gap-12 lg:grid-cols-1 lg:content-start lg:gap-14 lg:border-b-0 lg:pb-0 lg:pr-4">
          <label className="block text-xs font-medium tracking-[0.15em]">
            FRAME
            <span className="relative mt-3 block">
              <select value={frame.id} onChange={(event) => { setFrameId(event.target.value); setAdded(false) }} className="w-full appearance-none border-b border-black/30 bg-transparent py-3 pr-10 text-lg tracking-normal outline-none focus-visible:border-black">
                {shopFrames.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-0 top-3 text-base">⌄</span>
            </span>
          </label>
          <label className="block text-xs font-medium tracking-[0.15em]">
            MATTE
            <span className="relative mt-3 block">
              <select value={matte.id} onChange={(event) => { setMatteId(event.target.value); setAdded(false) }} className="w-full appearance-none border-b border-black/30 bg-transparent py-3 pr-10 text-lg tracking-normal outline-none focus-visible:border-black">
                {shopMattes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <span className="pointer-events-none absolute right-0 top-3 text-base">⌄</span>
            </span>
          </label>
          <fieldset className="block text-xs font-medium tracking-[0.15em]">
            <legend>DISPLAY</legend>
            <div className="mt-4 inline-flex rounded border border-black/20 p-0.5" aria-label="Display appearance">
              {displayOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedDisplay === item.id}
                  onClick={() => { setSelectedDisplay(item.id); setAdded(false) }}
                  className={`rounded px-5 py-2 text-sm tracking-normal transition-colors ${selectedDisplay === item.id ? 'bg-black text-white' : 'text-black/65 hover:text-black'}`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mx-auto mt-10 max-w-[620px] lg:sticky lg:top-8 lg:mt-0 lg:w-full lg:self-start lg:border-l lg:border-black/10 lg:py-1 lg:pl-12">
          <h2 className="mb-6 text-xs font-medium tracking-[0.15em]">YOUR RE:MIND</h2>
          <dl className="space-y-3 text-[15px]">
            <div className="flex justify-between gap-6"><dt>RE:MIND</dt><dd>{formatNok(remindProduct.price)}</dd></div>
            {frameUpgrade > 0 && <div className="flex justify-between gap-6"><dt>{frame.name}</dt><dd>+{formatNok(frameUpgrade)}</dd></div>}
            {matteUpgrade > 0 && <div className="flex justify-between gap-6"><dt>{matte.name}</dt><dd>+{formatNok(matteUpgrade)}</dd></div>}
            <div className="mt-5 flex justify-between gap-6 border-t border-black/20 pt-5 text-lg font-medium"><dt>TOTAL</dt><dd>{formatNok(total)}</dd></div>
          </dl>
          <button type="button" onClick={addConfiguration} className="shop-button mt-9 w-full rounded bg-black px-8 py-4 text-sm font-medium tracking-[0.08em] text-white">ADD TO CART</button>
          <p className="mt-3 min-h-5 text-center text-sm text-black/60" role="status">{added ? 'Configuration added to cart.' : ''}</p>
        </div>
      </section>
    </>
  )
}
