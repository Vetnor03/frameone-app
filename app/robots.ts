import type { MetadataRoute } from 'next'
import { SITE_URL } from './shop/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/shop/', '/cookies', '/privacy', '/terms'],
      disallow: ['/api/', '/login', '/test', '/feedback'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
