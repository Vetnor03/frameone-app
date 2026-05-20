import type { ReactNode } from 'react'
import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#f6f3ed',
}

export default function ShopLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
