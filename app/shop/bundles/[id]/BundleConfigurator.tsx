'use client'

import { useState } from 'react'
import { addCartItem, type BundleCartItem } from '../../cart'
import { ConfigurationPlaceholder } from '../../configure/Configurator'
import { displayOptions, formatNok, isFramePurchasable, shopFrames, shopMattes, type DisplayMode } from '../../productData'
import { bundleRegularPrice, bundleSavings, type ShopBundle } from '../../bundleData'

const frames = shopFrames.filter((item) => item.price !== null && !item.id.startsWith('custom-') && isFramePurchasable(item))
const mattes = shopMattes.filter((item) => item.price !== null && !item.id.startsWith('custom-'))

export default function BundleConfigurator({ bundle }: { bundle: ShopBundle }) {
  const [frameIds, setFrameIds] = useState(() => Array.from({ length: bundle.frameCount }, (_, i) => frames[i].id))
  const [matteIds, setMatteIds] = useState(() => Array.from({ length: bundle.matteCount }, (_, i) => mattes[i].id))
  const [display, setDisplay] = useState<DisplayMode>('dark')
  const [added, setAdded] = useState(false)
  const selectedFrames = frameIds.map((id) => frames.find((item) => item.id === id) ?? frames[0])
  const selectedMattes = matteIds.map((id) => mattes.find((item) => item.id === id) ?? mattes[0])
  const framePrices = selectedFrames.map(({ price }) => price!)
  const mattePrices = selectedMattes.map(({ price }) => price!)
  const regularPrice = bundleRegularPrice(bundle, framePrices, mattePrices)
  const saving = bundleSavings(bundle, framePrices, mattePrices)

  function update(items: string[], index: number, value: string, setter: (value: string[]) => void) { const next = [...items]; next[index] = value; setter(next); setAdded(false) }
  function addBundle() {
    const cartItem: BundleCartItem = {
      id: `bundle-${bundle.id}-${Date.now()}`,
      productId: `bundle-${bundle.id}`,
      productName: bundle.name,
      productType: 'bundle',
      display: bundle.deviceCount ? display : undefined,
      frames: selectedFrames.map(({ id, name }) => ({ id, name })),
      mattes: selectedMattes.map(({ id, name }) => ({ id, name })),
      quantity: 1,
      totalPrice: bundle.price,
    }
    addCartItem(cartItem)
    setAdded(true)
  }

  return <div className="mt-7 grid gap-9 lg:grid-cols-[1.1fr_.9fr] lg:gap-14">
    <div className="flex min-h-[360px] items-center rounded-lg bg-[#eeeae4] p-6 sm:p-10"><ConfigurationPlaceholder display={display} frameId={frameIds[0]} matteId={matteIds[0]} /></div>
    <div>
      {bundle.deviceCount > 0 && <fieldset><legend className="text-xs font-medium tracking-[.15em]">DISPLAY</legend><div className="mt-3 inline-flex rounded border border-black/20 p-0.5">{displayOptions.map((option) => <button key={option.id} type="button" onClick={() => { setDisplay(option.id); setAdded(false) }} className={`rounded px-6 py-2 text-sm ${display === option.id ? 'bg-black text-white' : ''}`}>{option.name}</button>)}</div><p className="mt-2 max-w-md text-[11px] font-normal leading-4 tracking-normal text-black/45">* Dark and light modes are both included. This only changes the preview; select the display mode in the app settings.</p></fieldset>}
      <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {frameIds.map((id, index) => <label key={`frame-${index}`} className="text-xs font-medium tracking-[.13em]">FRAME {index + 1}<select value={id} onChange={(e) => update(frameIds, index, e.target.value, setFrameIds)} className="mt-2 w-full border-b border-black/25 bg-transparent py-3 text-base font-normal tracking-normal">{frames.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
        {matteIds.map((id, index) => <label key={`matte-${index}`} className="text-xs font-medium tracking-[.13em]">MATTE {index + 1}<select value={id} onChange={(e) => update(matteIds, index, e.target.value, setMatteIds)} className="mt-2 w-full border-b border-black/25 bg-transparent py-3 text-base font-normal tracking-normal">{mattes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
      </div>
      <div className="mt-8 border-t border-black/10 pt-6"><div className="flex items-end justify-between"><div><p className="text-sm text-black/45 line-through">Separately {formatNok(regularPrice)}</p><p className="mt-1 text-sm text-emerald-700">You save {formatNok(saving)}</p></div><strong className="text-2xl font-medium">{formatNok(bundle.price)}</strong></div><button type="button" onClick={addBundle} className="shop-button mt-6 w-full rounded bg-black px-8 py-4 text-sm font-medium tracking-[.08em] text-white">ADD BUNDLE TO CART</button><p role="status" className="mt-3 min-h-5 text-center text-sm text-black/60">{added ? 'Your bundle was added to cart.' : 'Every component is included in the bundle price.'}</p></div>
    </div>
  </div>
}
