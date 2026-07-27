'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { isConfiguredCartItem, readCart, removeCartItem, SHOP_CART_CHANGED, updateCartItemQuantity } from '../cart'
import type { CartItem } from '../cart'
import { PlaceholderFigure } from '../CatalogPage'
import { ConfigurationPlaceholder } from '../configure/Configurator'
import { formatNok } from '../productData'

const FREE_SHIPPING_THRESHOLD = 1000

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [discountApplied, setDiscountApplied] = useState(false)
  const [discountMessage, setDiscountMessage] = useState('')

  useEffect(() => {
    const update = () => {
      setItems(readCart())
      setLoaded(true)
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
    if (discountCode.trim().toUpperCase() === 'REMIND10') {
      setDiscountApplied(true)
      setDiscountMessage('Discount code applied — 10% off.')
    } else {
      setDiscountApplied(false)
      setDiscountMessage('This discount code is not valid.')
    }
  }

  if (!loaded) return <div className="min-h-[480px] bg-[#faf9f7]" />

  return (
    <section className="bg-[#faf9f7] px-5 py-10 sm:px-6 md:py-16">
      <div className="mx-auto max-w-[1100px]">
        <h1 className="text-[34px] font-medium tracking-[-0.025em] md:text-[44px]">Your cart</h1>
        <p className="mt-2 text-sm text-black/55">Review your selections before checkout.</p>

        {items.length === 0 ? (
          <div className="mt-10 border border-black/10 bg-white px-6 py-16 text-center">
            <h2 className="text-xl font-medium">Your cart is empty</h2>
            <p className="mt-2 text-sm text-black/55">Build a RE:MIND that feels right at home.</p>
            <a href="/shop/configure" className="shop-button mt-7 inline-block rounded-sm bg-black px-8 py-3 text-sm font-medium text-white">BUILD YOUR RE:MIND</a>
          </div>
        ) : (
          <div className="mt-9 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {items.map((item) => (
                <article key={item.id} className="grid grid-cols-[100px_1fr] gap-5 border border-black/10 bg-white p-4 sm:grid-cols-[150px_1fr] sm:p-5">
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-[#f4f2ed]">
                    {isConfiguredCartItem(item) ? (
                      <ConfigurationPlaceholder display={item.display} frameId={item.frame.id} matteId={item.matte.id} />
                    ) : !item.imageSrc ? (
                      <PlaceholderFigure colors={item.colors ?? ['#f6f4ef', '#d9d5cf']} kind={item.productType === 'matte' ? 'mattes' : 'frames'} />
                    ) : !isConfiguredCartItem(item) && item.imageSrc ? (
                      <Image src={item.imageSrc} alt={item.productName} width={300} height={300} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col sm:flex-row sm:justify-between sm:gap-6">
                    <div>
                      <h2 className="font-medium tracking-[0.08em]">{item.productName}</h2>
                      {isConfiguredCartItem(item) ? (
                        <dl className="mt-2 space-y-0.5 text-sm leading-5 text-black/55">
                          <div><dt className="inline">Display: </dt><dd className="inline capitalize">{item.display}</dd></div>
                          <div><dt className="inline">Frame: </dt><dd className="inline">{item.frame.name}</dd></div>
                          <div><dt className="inline">Matte: </dt><dd className="inline">{item.matte.name}</dd></div>
                        </dl>
                      ) : <p className="mt-2 text-sm capitalize text-black/55">Replacement {item.productType}</p>}
                      <div className="mt-5 flex items-center gap-3">
                        <span className="text-xs font-medium uppercase tracking-[0.08em]">Qty</span>
                        <div className="flex h-9 items-center border border-black/20" aria-label={`Quantity for ${item.productName}`}>
                          <button className="h-full w-9 text-lg disabled:text-black/25" type="button" disabled={item.quantity <= 1} onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)} aria-label="Decrease quantity">−</button>
                          <span className="w-8 text-center text-sm" aria-live="polite">{item.quantity}</span>
                          <button className="h-full w-9 text-lg" type="button" onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)} aria-label="Increase quantity">+</button>
                        </div>
                        <button type="button" className="ml-1 text-xs text-black/55 underline underline-offset-4 hover:text-black" onClick={() => removeCartItem(item.id)}>Remove</button>
                      </div>
                    </div>
                    <p className="mt-5 whitespace-nowrap font-medium sm:mt-0">{formatNok(item.totalPrice * item.quantity)}</p>
                  </div>
                </article>
              ))}
              <a href="/shop" className="inline-block pt-2 text-sm underline underline-offset-4">Continue shopping</a>
            </div>

            <aside className="border border-black/10 bg-white p-6 sm:p-7">
              <h2 className="text-xl font-medium">Order summary</h2>
              <div className="mt-6 border-b border-black/10 pb-6">
                <label htmlFor="discount-code" className="text-xs font-medium uppercase tracking-[0.1em]">Discount code</label>
                <div className="mt-2 flex">
                  <input id="discount-code" value={discountCode} onChange={(event) => setDiscountCode(event.target.value)} placeholder="Enter code" className="min-w-0 flex-1 border border-r-0 border-black/20 bg-white px-3 py-2.5 text-sm outline-none focus:border-black" />
                  <button type="button" onClick={applyDiscount} className="border border-black bg-black px-4 text-xs font-medium text-white">APPLY</button>
                </div>
                {discountMessage && <p role="status" className={`mt-2 text-xs ${discountApplied ? 'text-emerald-700' : 'text-red-700'}`}>{discountMessage}</p>}
              </div>
              <dl className="space-y-3 border-b border-black/10 py-6 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatNok(subtotal)}</dd></div>
                {discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>− {formatNok(discount)}</dd></div>}
                <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping === 0 ? 'Free' : formatNok(shipping)}</dd></div>
              </dl>
              <div className="flex items-baseline justify-between py-6"><span className="font-medium">Total</span><strong className="text-xl font-medium">{formatNok(total)}</strong></div>
              <button type="button" className="shop-button w-full rounded-sm bg-black py-3.5 text-sm font-medium tracking-[0.06em] text-white">CHECKOUT</button>
              <p className="mt-4 text-center text-xs text-black/45">Taxes included. Secure checkout.</p>
            </aside>
          </div>
        )}
      </div>
    </section>
  )
}
