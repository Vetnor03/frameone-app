import type { Metadata } from 'next'

export const SITE_URL = 'https://re-mind.no'
export const SHOP_SOCIAL_IMAGE = '/shop/hero-top.jpg'
export const SHOP_DESCRIPTION =
  'RE:MIND is a customizable e-paper display for reminders, weather, events and the information that matters to you — designed to fit naturally into your home.'

type ShopMetadata = {
  title: string
  description: string
  path: string
  type?: 'website'
}

export function shopMetadata({ title, description, path, type = 'website' }: ShopMetadata): Metadata {
  const canonical = new URL(path, SITE_URL).toString()

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'RE:MIND',
      type,
      images: [{ url: SHOP_SOCIAL_IMAGE, alt: 'RE:MIND e-paper display in a home interior' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SHOP_SOCIAL_IMAGE],
    },
  }
}
