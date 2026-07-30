'use client'

import { useState, type CSSProperties } from 'react'
import { addCartItem } from '../cart'
import { configurationTotal, optionUpgrade } from '../configuratorLogic'
import { displayOptions, formatNok, frameDisplayName, isFramePurchasable, isMattePurchasable, matteDisplayName, remindProduct, shopFrames, shopMattes, type DisplayMode, type ShopLocale } from '../productData'
import styles from './Configurator.module.css'
import { SHOP_CURRENCY, trackShopEvent } from '../analytics'

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
  'classic-white': { background: '#f6f4ef' },
  'soft-black': { background: '#242424' },
  'warm-beige': { background: '#d8c7b4' },
  'cocoa-brown': { background: '#62483b' },
  'sage-green': { background: '#87927e' },
  'white---black': { background: 'linear-gradient(135deg, #f4f2ed 0 50%, #282828 50%)' },
  'black---white': { background: 'linear-gradient(135deg, #252525 0 50%, #f0eee9 50%)' },
  'mist-grey': { background: '#b9bdbe' },
  'dusty-blue': { background: '#7f929f' },
  'blush-pink': { background: '#cdaaa4' },
  ochre: { background: '#b8863e' },
  'forest-green': { background: '#344b3d' },
  burgundy: { background: '#633b42' },
  'natural-linen': { background: 'linear-gradient(90deg, #cbbba2, #e8dece 48%, #cbbba2)' },
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

const purchasableFrames = shopFrames.filter(isFramePurchasable)
const purchasableMattes = shopMattes.filter(isMattePurchasable)

function FramePlaceholder({ frameId }: { frameId: string }) {
  const frame = shopFrames.find((item) => item.id === frameId)
  const railAppearance = frameAppearances[frameId] ?? { background: frame?.palette[0] ?? '#181817' }

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
  const appearance = matteAppearances[matteId] ?? { background: '#d8d2c8' }

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

export function ConfigurationPlaceholder({ display, frameId, matteId }: { display: DisplayMode; frameId: string; matteId: string }) {
  return (
    <div className="relative aspect-[4/3] w-full" aria-hidden="true">
      <DevicePlaceholder display={display} />
      <MattePlaceholder matteId={matteId} />
      <FramePlaceholder frameId={frameId} />
    </div>
  )
}

const configuratorCopy = {
  en: {
    backToHome: 'Back to home',
    title: 'BUILD YOUR RE:MIND',
    subtitle: 'Choose a frame and matte to make RE:MIND feel at home in your space.',
    display: 'DISPLAY',
    displayNames: { dark: 'Dark', light: 'Light' },
    displayAppearance: 'Display appearance',
    displayNote: '* Dark and light modes are both included. This only changes the preview; select the display mode in the app settings.',
    frame: 'FRAME',
    matte: 'MATTE',
    summary: 'YOUR RE:MIND',
    total: 'TOTAL',
    includedHeading: 'What’s included',
    included: 'RE:MIND display · Your frame · Your matte · Charging cable · Setup guide',
    premiumNote: 'Premium choices may add to the total. Additional frames and mattes are available separately.',
    addToCart: 'ADD TO CART',
    addedToCart: 'Configuration added to cart.',
    previewLabel: (frame: string, matte: string, display: string) => `${frame} frame with ${matte} matte and ${display.toLowerCase()} display`,
    storyEyebrow: 'BUILT TO LIVE WITH YOU',
    storyTitle: 'Made to stay. Easy to change.',
    storyBody: 'RE:MIND is a quiet e-paper display made for your home, not another glowing screen to manage. It arrives as a complete frame with the display, matte and frame you choose — ready to place, easy to update, and simple to restyle later.',
    storyDetails: [
      ['READY FROM DAY ONE', 'Choose your frame and matte, add it to your home, and RE:MIND feels finished from the moment it arrives.'],
      ['LONG BATTERY LIFE', 'Designed to live naturally on a shelf, desk or wall without a cable always in sight.'],
      ['NOT LOCKED TO ONE LOOK', 'Frames and mattes click on and off, so you can change the style later instead of replacing the product.'],
    ],
  },
  no: {
    backToHome: 'TILBAKE TIL FORSIDEN',
    title: 'SETT SAMMEN DIN RE:MIND',
    subtitle: 'Velg ramme og innlegg som passer hjemmet ditt.',
    display: 'VISNING',
    displayNames: { dark: 'Mørk', light: 'Lys' },
    displayAppearance: 'Visningsutseende',
    displayNote: 'Mørk og lys visning følger med. Dette endrer kun forhåndsvisningen. Visningsmodus velges i appinnstillingene.',
    frame: 'RAMME',
    matte: 'INNLEGG',
    summary: 'DIN RE:MIND',
    total: 'TOTALT',
    includedHeading: 'DETTE FØLGER MED',
    included: 'RE:MIND · Valgt ramme · Valgt innlegg · Ladekabel · Oppstartsveiledning',
    premiumNote: 'Enkelte premiumvalg kan øke totalprisen. Ekstra rammer og innlegg kan kjøpes separat.',
    addToCart: 'LEGG I HANDLEKURV',
    addedToCart: 'Konfigurasjonen er lagt i handlekurven.',
    previewLabel: (frame: string, matte: string, display: string) => `${frame} ramme med ${matte} innlegg og ${display.toLowerCase()} visning`,
    storyEyebrow: 'LAGET FOR Å PASSE INN',
    storyTitle: 'En del av hjemmet. Klar for nye uttrykk.',
    storyBody: 'RE:MIND er en rolig e-papirskjerm laget for hjemmet – ikke enda en lysende skjerm som krever oppmerksomhet. Den leveres komplett med skjerm, ramme og innlegg du velger – klar til å settes på plass, enkel å oppdatere og lett å gi et nytt uttrykk senere.',
    storyDetails: [
      ['KLAR FRA FØRSTE DAG', 'Velg ramme og innlegg, finn plassen hjemme, og RE:MIND føles gjennomført fra første stund.'],
      ['LANG BATTERITID', 'Designet for å stå naturlig på en hylle, et bord eller en vegg – uten en kabel som alltid er synlig.'],
      ['FRIHET TIL Å ENDRE UTTRYKK', 'Rammer og innlegg klikkes enkelt av og på, slik at du kan endre uttrykket senere uten å bytte ut hele produktet.'],
    ],
  },
} as const

function ProductStory({ className = '', language }: { className?: string; language: ShopLocale }) {
  const copy = configuratorCopy[language]
  return (
    <section className={`${styles.productStory} ${className}`}>
      <div className={styles.storyIntro}>
        <p className="text-xs font-medium tracking-[0.15em]">{copy.storyEyebrow}</p>
        <h2 className="mt-4 text-[26px] font-medium leading-tight tracking-[0.04em] sm:text-[32px]">{copy.storyTitle}</h2>
        <p className="mt-4 max-w-[42rem] text-[15px] leading-7 text-black/60">
          {copy.storyBody}
        </p>
      </div>
      <dl className={styles.storyDetails}>
        {copy.storyDetails.map(([title, body]) => <div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}
      </dl>
    </section>
  )
}

export default function Configurator({ initialFrameId, initialMatteId, language }: { initialFrameId?: string; initialMatteId?: string; language: ShopLocale }) {
  const copy = configuratorCopy[language]
  const [frameId, setFrameId] = useState(() => purchasableFrames.some((item) => item.id === initialFrameId) ? initialFrameId! : purchasableFrames[0].id)
  const [matteId, setMatteId] = useState(() => purchasableMattes.some((item) => item.id === initialMatteId) ? initialMatteId! : purchasableMattes[0].id)
  const [selectedDisplay, setSelectedDisplay] = useState<DisplayMode>('dark')
  const [added, setAdded] = useState(false)
  const frame = purchasableFrames.find((item) => item.id === frameId) ?? purchasableFrames[0]
  const matte = purchasableMattes.find((item) => item.id === matteId) ?? purchasableMattes[0]
  const display = displayOptions.find((item) => item.id === selectedDisplay) ?? displayOptions[0]
  const frameUpgrade = optionUpgrade(frame.price, purchasableFrames.map((item) => item.price))
  const matteUpgrade = optionUpgrade(matte.price, purchasableMattes.map((item) => item.price))
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
    trackShopEvent('add_to_cart', {
      product: 'RE:MIND',
      frame_id: frame.id,
      frame_name: frame.name,
      matte_id: matte.id,
      matte_name: matte.name,
      total_price: total,
      currency: SHOP_CURRENCY,
    })
    setAdded(true)
  }

  function selectFrame(nextFrameId: string) {
    if (nextFrameId === frame.id) return
    const nextFrame = purchasableFrames.find((item) => item.id === nextFrameId)
    if (!nextFrame) return
    setFrameId(nextFrame.id)
    setAdded(false)
    trackShopEvent('frame_selected', {
      frame_id: nextFrame.id,
      frame_name: nextFrame.name,
      availability: nextFrame.availability,
      price_delta: optionUpgrade(nextFrame.price, purchasableFrames.map((item) => item.price)),
    })
  }

  function selectMatte(nextMatteId: string) {
    if (nextMatteId === matte.id) return
    const nextMatte = purchasableMattes.find((item) => item.id === nextMatteId)
    if (!nextMatte) return
    setMatteId(nextMatte.id)
    setAdded(false)
    trackShopEvent('matte_selected', {
      matte_id: nextMatte.id,
      matte_name: nextMatte.name,
      availability: nextMatte.availability,
      price_delta: optionUpgrade(nextMatte.price, purchasableMattes.map((item) => item.price)),
    })
  }

  return (
    <div className={styles.desktopLayout}>
      <section className={`border-b border-black/10 bg-white ${styles.previewSection}`}>
        <div className={`mx-auto max-w-[1200px] px-4 pb-8 pt-10 sm:px-6 md:pb-12 md:pt-14 ${styles.previewInner}`}>
          <a href={`/shop?lang=${language}`} className={`group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-black/60 hover:text-black focus-visible:text-black ${styles.backLink}`}>
            <span aria-hidden className="text-base transition-transform group-hover:-translate-x-0.5">←</span>
            {copy.backToHome}
          </a>
          <div className={`text-center ${styles.heading}`}>
            <h1 className="text-[30px] font-medium tracking-[0.12em] sm:text-[38px]">{copy.title}</h1>
            <p className="mt-3 text-[16px] text-black/60">{copy.subtitle}</p>
          </div>

          <div className={`relative mt-7 md:mt-10 ${styles.previewArea}`}>
            <div className="relative mx-auto aspect-[4/3] w-full max-w-[760px] overflow-hidden" aria-live="polite" aria-label={copy.previewLabel(frameDisplayName(frame.id, frame.name, language), matteDisplayName(matte.id, matte.name, language), copy.displayNames[display.id])}>
              <div className={styles.previewObject}>
                <ConfigurationPlaceholder display={display.id} frameId={frame.id} matteId={matte.id} />
              </div>
            </div>
          </div>

        </div>
      </section>

      <section className={`mx-auto max-w-[1200px] px-4 py-10 sm:px-6 md:py-14 ${styles.purchaseColumn}`}>
        <div className={styles.purchaseCard}>
          <div className={styles.controlsCard}>
            <fieldset className="block text-xs font-medium tracking-[0.15em]">
              <legend>{copy.display}</legend>
              <div className={styles.displayChoice}>
                <div className="inline-flex shrink-0 rounded border border-black/20 p-0.5" aria-label={copy.displayAppearance}>
                  {displayOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selectedDisplay === item.id}
                      onClick={() => { setSelectedDisplay(item.id); setAdded(false) }}
                      className={`rounded px-5 py-2 text-sm tracking-normal transition-colors ${selectedDisplay === item.id ? 'bg-black text-white' : 'text-black/65 hover:text-black'}`}
                    >
                      {copy.displayNames[item.id]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 max-w-md text-[11px] font-normal leading-4 tracking-normal text-black/45">{copy.displayNote}</p>
              </div>
            </fieldset>
            <div>
              <label className="block text-xs font-medium tracking-[0.15em]">
                {copy.frame}
                <span className="relative mt-3 block">
                  <select value={frame.id} onChange={(event) => selectFrame(event.target.value)} className="w-full appearance-none border-b border-black/30 bg-transparent py-3 pr-10 text-lg tracking-normal outline-none focus-visible:border-black">
                    {purchasableFrames.map((item) => <option key={item.id} value={item.id}>{frameDisplayName(item.id, item.name, language)}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-0 top-3 text-base">⌄</span>
                </span>
              </label>
            </div>
            <label className="block text-xs font-medium tracking-[0.15em]">
              {copy.matte}
              <span className="relative mt-3 block">
                <select value={matte.id} onChange={(event) => selectMatte(event.target.value)} className="w-full appearance-none border-b border-black/30 bg-transparent py-3 pr-10 text-lg tracking-normal outline-none focus-visible:border-black">
                  {purchasableMattes.map((item) => <option key={item.id} value={item.id}>{matteDisplayName(item.id, item.name, language)}</option>)}
                </select>
                <span className="pointer-events-none absolute right-0 top-3 text-base">⌄</span>
              </span>
            </label>
          </div>

          <div className={styles.summaryCard}>
            <h2 className="mb-6 text-xs font-medium tracking-[0.15em]">{copy.summary}</h2>
            <dl className="space-y-3 text-[15px]">
              <div className="flex justify-between gap-6"><dt>RE:MIND</dt><dd>{formatNok(remindProduct.price, language)}</dd></div>
              {frameUpgrade > 0 && <div className="flex justify-between gap-6"><dt>{frameDisplayName(frame.id, frame.name, language)}</dt><dd>+{formatNok(frameUpgrade, language)}</dd></div>}
              {matteUpgrade > 0 && <div className="flex justify-between gap-6"><dt>{matteDisplayName(matte.id, matte.name, language)}</dt><dd>+{formatNok(matteUpgrade, language)}</dd></div>}
              <div className="mt-5 flex justify-between gap-6 border-t border-black/20 pt-5 text-lg font-medium"><dt>{copy.total}</dt><dd>{formatNok(total, language)}</dd></div>
            </dl>
            <div className="mt-7 border-t border-black/10 pt-5">
              <p className="text-xs font-medium uppercase tracking-[0.15em]">{copy.includedHeading}</p>
              <p className="mt-2 text-[13px] leading-5 text-black/60">{copy.included}</p>
              <p className="mt-2 text-xs leading-5 text-black/50">{copy.premiumNote}</p>
            </div>
            <button type="button" onClick={addConfiguration} className="shop-button mt-6 w-full rounded bg-black px-8 py-4 text-sm font-medium tracking-[0.08em] text-white">{copy.addToCart}</button>
            <p className="mt-3 min-h-5 text-center text-sm text-black/60" role="status">{added ? copy.addedToCart : ''}</p>
          </div>
        </div>
      </section>

      <ProductStory className={styles.mobileStory} language={language} />
      <ProductStory className={styles.desktopStory} language={language} />
    </div>
  )
}
