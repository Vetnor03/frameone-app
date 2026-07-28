import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { shopMetadata } from '../shop/seo'

export const metadata: Metadata = shopMetadata({
  title: 'Cookies | RE:MIND',
  description: 'How RE:MIND uses cookies and browser storage across its website and app.',
  path: '/cookies',
})

export default function CookiesLayout({ children }: { children: ReactNode }) {
  return children
}
