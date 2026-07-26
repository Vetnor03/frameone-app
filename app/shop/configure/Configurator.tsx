'use client'

import { useState, type CSSProperties } from 'react'
import { addCartItem } from '../cart'
import { configurationTotal, optionUpgrade } from '../configuratorLogic'
import { displayOptions, formatNok, remindProduct, shopFrames, shopMattes, type DisplayMode } from '../productData'
import styles from './Configurator.module.css'

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
  const railAppearance = frameAppearances[frameId]

  return (
    <span
      aria-hidden="true"
      className="absolute inset-[8%] z-30 rounded-[0.35rem] shadow-[0_0.35rem_0.75rem_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.22)]"
    >
      <span className="absolute inset-x-0 top-0 h-[12%] rounded-t-[0.35rem] shadow-[inset_0_1px_rgba(255,255,255,0.18),inset_0_-0.3rem_0.5rem_rgba(0,0,0,0.14)] transition-colors duration-200" style={railAppearance} />
      <span className="absolute inset-x-0 bottom-0 h-[12%] rounded-b-[0.35rem] shadow-[inset_0_-1px_rgba(0,0,0,0.28),inset_0_0.3rem_0.5rem_rgba(255,255,255,0.06)] transition-colors duration-200" style={railAppearance} />
      <span className="absolute inset-y-0 left-0 w-[9%] rounded-l-[0.35rem] shadow-[inset_1px_0_rgba(255,255,255,0.14),inset_-0.3rem_0_0.5rem_rgba(0,0,0,0.14)] transition-colors duration-200" style={railAppearance} />
      <span className="absolute inset-y-0 right-0 w-[9%] rounded-r-[0.35rem] shadow-[inset_-1px_0_rgba(0,0,0,0.28),inset_0.3rem_0_0.5rem_rgba(255,255,255,0.06)] transition-colors duration-200" style={railAppearance} />
      <span className="absolute inset-x-[9%] inset-y-[12%] rounded-[0.08rem] shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_0_0.4rem_rgba(0,0,0,0.3)]" />
    </span>
  )
}

function MattePlaceholder({ matteId }: { matteId: string }) {
  const appearance = matteAppearances[matteId]

  return (
    <span aria-hidden="true" className="absolute inset-x-[13%] inset-y-[15.5%] z-20 rounded-[0.08rem]">
      <span className="absolute inset-x-0 top-0 h-[14.5%] rounded-t-[0.08rem]" style={appearance} />
      <span className="absolute inset-x-0 bottom-0 h-[14.5%] rounded-b-[0.08rem]" style={appearance} />
      <span className="absolute inset-y-[14.5%] left-0 w-[10.15%]" style={appearance} />
      <span className="absolute inset-y-[14.5%] right-0 w-[10.15%]" style={appearance} />
      <span className="pointer-events-none absolute inset-x-[10.15%] inset-y-[14.5%] rounded-[0.08rem] shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_0.2rem_rgba(0,0,0,0.16)]" />
    </span>
  )
}

function DevicePlaceholder({ display }: { display: DisplayMode }) {
  const light = display === 'light'
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-[20.5%] inset-y-[25.5%] z-10 flex items-center justify-center overflow-hidden rounded-[0.15rem] border border-black/20 shadow-[0_1px_0_rgba(255,255,255,0.12),0_0.2rem_0.5rem_rgba(0,0,0,0.18)]"
      style={{ background: light ? '#dddcd5' : '#242423', color: light ? '#292927' : '#f2f0e9' }}
    >
      <span className="text-[clamp(0.45rem,1.3vw,0.9rem)] font-medium tracking-[0.22em]">RE:MIND</span>
    </span>
  )
}

function ProductStory({ className = '' }: { className?: string }) {
  return (
    <section className={`${styles.productStory} ${className}`}>
      <div className={styles.storyIntro}>
        <p className="text-xs font-medium tracking-[0.15em]">MADE FOR MORE MOMENTS</p>
        <h2 className="mt-4 text-[26px] font-medium leading-tight tracking-[0.04em] sm:text-[32px]">Less screen time. More of what is right in front of you.</h2>
        <p className="mt-4 max-w-[42rem] text-[15px] leading-7 text-black/60">
          RE:MIND keeps the information you care about quietly in view, without pulling you into another glowing screen. It is designed to feel at home in your space—and in your life.
        </p>
      </div>
      <dl className={styles.storyDetails}>
        <div>
          <dt>UP TO ONE YEAR</dt>
          <dd>A single charge can last up to a year, and the rechargeable battery keeps disposable cells and cables out of sight.</dd>
        </div>
        <div>
          <dt>CLICK. SWAP. REPEAT.</dt>
          <dd>Mix frames and mattes to suit the room, the season, or your mood, with an easy and satisfying click.</dd>
        </div>
        <div>
          <dt>THOUGHTFULLY MADE</dt>
          <dd>Interchangeable parts and considered materials help one product adapt over time, instead of being replaced.</dd>
        </div>
      </dl>
    </section>
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
  const frameUpgrade = optionUpgrade(frame.price, shopFrames.map((item) => item.price))
  const matteUpgrade = optionUpgrade(matte.price, shopMattes.map((item) => item.price))
  const total = configurationTotal(remindProduct.price, frameUpgrade, matteUpgrade)

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
    <div className={styles.desktopLayout}>
      <section className={`border-b border-black/10 bg-white ${styles.previewSection}`}>
        <div className={`mx-auto max-w-[1200px] px-4 pb-8 pt-10 sm:px-6 md:pb-12 md:pt-14 ${styles.previewInner}`}>
          <div className={`text-center ${styles.heading}`}>
            <h1 className="text-[30px] font-medium tracking-[0.12em] sm:text-[38px]">BUILD YOUR RE:MIND</h1>
            <p className="mt-3 text-[16px] text-black/60">Find the combination that feels like home.</p>
          </div>

          <div className={`relative mt-7 md:mt-10 ${styles.previewArea}`}>
            <div className="relative mx-auto aspect-[4/3] w-full max-w-[760px] overflow-hidden" aria-live="polite" aria-label={`${frame.name} frame with ${matte.name} matte and ${display.name.toLowerCase()} display`}>
              <div className={styles.previewObject}>
                <DevicePlaceholder display={display.id} />
                <MattePlaceholder matteId={matte.id} />
                <FramePlaceholder frameId={frame.id} />
              </div>
            </div>
          </div>

          <ProductStory className={styles.mobileStory} />
        </div>
      </section>

      <section className={`mx-auto max-w-[1200px] px-6 py-10 md:py-14 ${styles.purchaseColumn}`}>
        <div className={`grid gap-7 border-b border-black/10 pb-10 md:grid-cols-2 md:gap-12 ${styles.controlsCard}`}>
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
          <fieldset className={`block text-xs font-medium tracking-[0.15em] ${styles.displayControl}`}>
            <legend>DISPLAY</legend>
            <div className={styles.displayChoice}>
              <div className="inline-flex shrink-0 rounded border border-black/20 p-0.5" aria-label="Display appearance">
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
            </div>
          </fieldset>
        </div>

        <div className={`mx-auto mt-10 max-w-[620px] ${styles.summaryCard}`}>
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

      <ProductStory className={styles.desktopStory} />
    </div>
  )
}
