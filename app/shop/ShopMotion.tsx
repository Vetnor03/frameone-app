'use client'

import Image, { type ImageProps } from 'next/image'
import { useEffect, useState, type ReactNode } from 'react'

export function ShopReveal({ children, delayMs = 0, className = '' }: { children: ReactNode; delayMs?: number; className?: string }) {
  return (
    <div className={`shop-reveal ${className}`.trim()} style={{ ['--shop-reveal-delay' as string]: `${delayMs}ms` }}>
      {children}
    </div>
  )
}

export function ShopFadeImage({ className = '', onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <Image
      {...props}
      className={`shop-fade-image ${loaded ? 'is-loaded' : ''} ${className}`.trim()}
      onLoad={(event) => {
        setLoaded(true)
        onLoad?.(event)
      }}
    />
  )
}

export function ShopMobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="shop-mobile-menu-wrap relative md:hidden">
      <button type="button" aria-expanded={open} aria-controls="shop-mobile-nav" onClick={() => setOpen((v) => !v)} className="shop-nav-trigger inline-flex items-center rounded border border-black/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.11em] text-black/75">
        Menu
      </button>
      <div id="shop-mobile-nav" className={`shop-mobile-nav ${open ? 'is-open' : ''}`}>
        <div className="shop-mobile-nav-inner mx-auto max-w-[1200px] px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
