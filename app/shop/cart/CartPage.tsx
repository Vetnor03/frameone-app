'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isBundleCartItem, isConfiguredCartItem, readCart, removeCartItem, SHOP_CART_CHANGED, updateCartItemQuantity } from '../cart'
import type { CartItem } from '../cart'
import { PlaceholderFigure } from '../CatalogPage'
import { ConfigurationPlaceholder } from '../configure/Configurator'
import { formatNok, frameDisplayName, matteDisplayName, type ShopLocale } from '../productData'
import { SHOP_CURRENCY, trackShopEvent } from '../analytics'

const FREE_SHIPPING_THRESHOLD = 1000

const norwegianBundleNames: Record<string, string> = {
  'complete-home': 'Komplettpakken',
  'frame-pair': 'Rammepar',
  'style-library': 'Stilkolleksjonen',
}

export default function CartPage({ language }: { language: ShopLocale }) {
  const isNorwegian = language === 'no'
  const [items, setItems] = useState<CartItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [discountApplied, setDiscountApplied] = useState(false)
  const [discountMessage, setDiscountMessage] = useState('')
  const cartViewTracked = useRef(false)

  useEffect(() => {
    const update = () => {
      const cartItems = readCart()
      setItems(cartItems)
      setLoaded(true)
      if (!cartViewTracked.current) {
        cartViewTracked.current = true
        trackShopEvent('cart_view', {
          item_count: cartItems.reduce((count, item) => count + item.quantity, 0),
          cart_total: cartItems.reduce((sum, item) => sum + item.totalPrice * item.quantity, 0),
          currency: SHOP_CURRENCY,
        })
      }
    }
    update()
    window.addEventListener(SHOP_CART_CHANGED, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(SHOP_CART_CHANGED, update)
      window.removeEventListener('storage', update)
    }
  }, [])

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.totalPrice * item.quantity, 0), [items])
  const discount = discountApplied ? Math.round(subtotal * 0.1) : 0
  const shipping = subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD ? 99 : 0
  const total = subtotal - discount + shipping

  function applyDiscount() {
    const code = discountCode.trim()
    if (!code) {
      setDiscountApplied(false)
      setDiscountMessage(isNorwegian ? 'Skriv inn en rabattkode.' : 'This discount code is not valid.')
    } else if (code.toUpperCase() === 'REMIND10') {
      setDiscountApplied(true)
      setDiscountMessage(isNorwegian ? 'Rabattkoden er lagt til.' : 'Discount code applied — 10% off.')
    } else {
      setDiscountApplied(false)
      setDiscountMessage(isNorwegian ? 'Rabattkoden kunne ikke brukes.' : 'This discount code is not valid.')
    }
  }

  function itemDisplayName(item: CartItem) {
    if (isConfiguredCartItem(item)) return item.productName
    if (isBundleCartItem(item)) return isNorwegian ? norwegianBundleNames[item.productId.replace('bundle-', '')] ?? item.productName : item.productName
    return item.productType === 'frame'
      ? frameDisplayName(item.productId, item.productName, language)
      : matteDisplayName(item.productId, item.productName, language)
  }

  if (!loaded) return <div className="min-h-[480px] bg-[#faf9f7]" />

  return (
    <section className="bg-[#faf9f7] px-5 py-10 sm:px-6 md:py-16">
      <div className="mx-auto max-w-[1100px]">
        <h1 className="text-[34px] font-medium tracking-[-0.025em] md:text-[44px]">{isNorwegian ? 'Handlekurv' : 'Your cart'}</h1>
        <p className="mt-2 text-sm text-black/55">{isNorwegian ? 'Se over valgene dine før du går videre til betaling.' : 'Review your selections before checkout.'}</p>

        {items.length === 0 ? (
          <div className="mt-10 border border-black/10 bg-white px-6 py-16 text-center">
            <h2 className="text-xl font-medium">{isNorwegian ? 'Handlekurven er tom' : 'Your cart is empty'}</h2>
            <p className="mt-2 text-sm text-black/55">{isNorwegian ? 'Sett sammen en RE:MIND som passer hjemmet ditt.' : 'Build a RE:MIND that feels right at home.'}</p>
            <a href={`/shop/configure?lang=${language}`} className="shop-button mt-7 inline-block rounded-sm bg-black px-8 py-3 text-sm font-medium text-white">{isNorwegian ? 'TILPASS DIN RE:MIND' : 'BUILD YOUR RE:MIND'}</a>
          </div>
        ) : (
          <div className="mt-9 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {items.map((item) => (
                <article key={item.id} className="grid grid-cols-[100px_1fr] gap-5 border border-black/10 bg-white p-4 sm:grid-cols-[150px_1fr] sm:p-5">
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-[#f4f2ed]">
                    {isConfiguredCartItem(item) ? (
                      <ConfigurationPlaceholder display={item.display} frameId={item.frame.id} matteId={item.matte.id} />
                    ) : isBundleCartItem(item) ? (
                      <ConfigurationPlaceholder display={item.display ?? 'dark'} frameId={item.frames[0].id} matteId={item.mattes[0].id} />
                    ) : !item.imageSrc ? (
                      <PlaceholderFigure colors={item.colors ?? ['#f6f4ef', '#d9d5cf']} kind={item.productType === 'matte' ? 'mattes' : 'frames'} />
                    ) : !isConfiguredCartItem(item) && item.imageSrc ? (
                      <Image src={item.imageSrc} alt={item.productName} width={300} height={300} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col sm:flex-row sm:justify-between sm:gap-6">
                    <div>
                      <h2 className="font-medium tracking-[0.08em]">{itemDisplayName(item)}</h2>
                      {isConfiguredCartItem(item) ? (
                        <dl className="mt-2 space-y-0.5 text-sm leading-5 text-black/55">
                          <div><dt className="inline">{isNorwegian ? 'Ramme: ' : 'Frame: '}</dt><dd className="inline">{frameDisplayName(item.frame.id, item.frame.name, language)}</dd></div>
                          <div><dt className="inline">{isNorwegian ? 'Innlegg: ' : 'Matte: '}</dt><dd className="inline">{matteDisplayName(item.matte.id, item.matte.name, language)}</dd></div>
                        </dl>
                      ) : isBundleCartItem(item) ? (
                        <dl className="mt-2 space-y-0.5 text-sm leading-5 text-black/55">
                          <div><dt className="inline">{isNorwegian ? 'Rammer: ' : 'Frames: '}</dt><dd className="inline">{item.frames.map((part) => frameDisplayName(part.id, part.name, language)).join(', ')}</dd></div>
                          <div><dt className="inline">{isNorwegian ? 'Innlegg: ' : 'Mattes: '}</dt><dd className="inline">{item.mattes.map((part) => matteDisplayName(part.id, part.name, language)).join(', ')}</dd></div>
                        </dl>
                      ) : <p className="mt-2 text-sm capitalize text-black/55">{isNorwegian ? `Ekstra ${item.productType === 'frame' ? 'ramme' : 'innlegg'}` : `Replacement ${item.productType}`}</p>}
                      <div className="mt-5 flex items-center gap-3">
                        <span className="text-xs font-medium uppercase tracking-[0.08em]">{isNorwegian ? 'Antall' : 'Qty'}</span>
                        <div className="flex h-9 items-center border border-black/20" aria-label={isNorwegian ? `Antall for ${itemDisplayName(item)}` : `Quantity for ${item.productName}`}>
                          <button className="h-full w-9 text-lg disabled:text-black/25" type="button" disabled={item.quantity <= 1} onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)} aria-label={isNorwegian ? 'Reduser antall' : 'Decrease quantity'}>−</button>
                          <span className="w-8 text-center text-sm" aria-live="polite">{item.quantity}</span>
                          <button className="h-full w-9 text-lg" type="button" onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)} aria-label={isNorwegian ? 'Øk antall' : 'Increase quantity'}>+</button>
                        </div>
                        <button type="button" className="ml-1 text-xs text-black/55 underline underline-offset-4 hover:text-black" onClick={() => removeCartItem(item.id)}>{isNorwegian ? 'Fjern' : 'Remove'}</button>
                      </div>
                    </div>
                    <p className="mt-5 whitespace-nowrap font-medium sm:mt-0">{formatNok(item.totalPrice * item.quantity, language)}</p>
                  </div>
                </article>
              ))}
              <a href={`/shop?lang=${language}`} className="inline-block pt-2 text-sm underline underline-offset-4">{isNorwegian ? 'Fortsett å handle' : 'Continue shopping'}</a>
            </div>

            <aside className="border border-black/10 bg-white p-6 sm:p-7">
              <h2 className="text-xl font-medium">{isNorwegian ? 'Oppsummering' : 'Order summary'}</h2>
              <div className="mt-6 border-b border-black/10 pb-6">
                <label htmlFor="discount-code" className="text-xs font-medium uppercase tracking-[0.1em]">{isNorwegian ? 'Rabattkode' : 'Discount code'}</label>
                <div className="mt-2 flex">
                  <input id="discount-code" value={discountCode} onChange={(event) => setDiscountCode(event.target.value)} placeholder={isNorwegian ? 'Skriv inn kode' : 'Enter code'} className="min-w-0 flex-1 border border-r-0 border-black/20 bg-white px-3 py-2.5 text-sm outline-none focus:border-black" />
                  <button type="button" onClick={applyDiscount} className="border border-black bg-black px-4 text-xs font-medium text-white">{isNorwegian ? 'BRUK' : 'APPLY'}</button>
                </div>
                {discountMessage && <p role="status" className={`mt-2 text-xs ${discountApplied ? 'text-emerald-700' : 'text-red-700'}`}>{discountMessage}</p>}
              </div>
              <dl className="space-y-3 border-b border-black/10 py-6 text-sm">
                <div className="flex justify-between"><dt>{isNorwegian ? 'Delsum' : 'Subtotal'}</dt><dd>{formatNok(subtotal, language)}</dd></div>
                {discount > 0 && <div className="flex justify-between text-emerald-700"><dt>{isNorwegian ? 'Rabatt' : 'Discount'}</dt><dd>− {formatNok(discount, language)}</dd></div>}
                <div className="flex justify-between"><dt>{isNorwegian ? 'Frakt' : 'Shipping'}</dt><dd>{shipping === 0 ? isNorwegian ? 'Gratis' : 'Free' : formatNok(shipping, language)}</dd></div>
              </dl>
              <div className="flex items-baseline justify-between py-6"><span className="font-medium">{isNorwegian ? 'Totalt' : 'Total'}</span><strong className="text-xl font-medium">{formatNok(total, language)}</strong></div>
              <button type="button" className="shop-button w-full rounded-sm bg-black py-3.5 text-sm font-medium tracking-[0.06em] text-white">{isNorwegian ? 'TIL BETALING' : 'CHECKOUT'}</button>
              <p className="mt-4 text-center text-xs text-black/45">{isNorwegian ? 'Mva. inkludert. Sikker betaling.' : 'Taxes included. Secure checkout.'}</p>
            </aside>
          </div>
        )}
      </div>
    </section>
  )
}
