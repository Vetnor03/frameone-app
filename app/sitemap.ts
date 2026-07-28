import type { MetadataRoute } from 'next'
import { shopBundles } from './shop/bundleData'
import { frameCatalog, matteCatalog } from './shop/catalogData'
import { SITE_URL } from './shop/seo'

const publicPages = [
  '/shop',
  '/shop/configure',
  '/shop/frames',
  '/shop/mattes',
  '/shop/bundles',
  '/shop/about',
  '/shop/faq',
  '/shop/contact',
  '/shop/shipping',
  '/shop/returns',
  '/shop/warranty',
  '/shop/sustainability',
  '/shop/press',
  '/cookies',
  '/privacy',
  '/terms',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const detailPages = [
    ...frameCatalog.map(({ id }) => `/shop/frames/${id}`),
    ...matteCatalog.map(({ id }) => `/shop/mattes/${id}`),
    ...shopBundles.map(({ id }) => `/shop/bundles/${id}`),
  ]

  return [...publicPages, ...detailPages].map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency: path === '/shop' ? 'weekly' : 'monthly',
    priority: path === '/shop' ? 1 : path === '/shop/configure' ? 0.9 : 0.7,
  }))
}
