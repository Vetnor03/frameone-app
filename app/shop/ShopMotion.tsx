'use client'

import Image, { type ImageProps } from 'next/image'
import { useState, type ReactNode } from 'react'

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
