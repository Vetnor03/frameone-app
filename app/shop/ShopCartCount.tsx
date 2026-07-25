'use client'

import { useEffect, useState } from 'react'
import { readCart, SHOP_CART_CHANGED } from './cart'

export default function ShopCartCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const update = () => setCount(readCart().reduce((sum, item) => sum + item.quantity, 0))
    update()
    window.addEventListener('storage', update)
    window.addEventListener(SHOP_CART_CHANGED, update)
    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener(SHOP_CART_CHANGED, update)
    }
  }, [])

  return count > 0 ? (
    <span className="absolute right-0 top-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[9px] leading-4 text-white" aria-label={`${count} items in cart`}>
      {count}
    </span>
  ) : null
}
