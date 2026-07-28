import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { shopMetadata } from '../shop/seo'

export const metadata: Metadata = shopMetadata({
  title: 'Terms | RE:MIND',
  description: 'Terms governing use of the RE:MIND app, services and connected display.',
  path: '/terms',
})

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children
}
