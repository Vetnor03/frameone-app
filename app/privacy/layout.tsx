import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { shopMetadata } from '../shop/seo'

export const metadata: Metadata = shopMetadata({
  title: 'Privacy | RE:MIND',
  description: 'How RE:MIND collects, uses and protects your personal information.',
  path: '/privacy',
})

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children
}
