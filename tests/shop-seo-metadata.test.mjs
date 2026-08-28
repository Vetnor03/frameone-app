import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop SEO uses the production domain and consistent sharing metadata', () => {
  const seo = read('app/shop/seo.ts')

  assert.match(seo, /https:\/\/re-mind\.no/)
  assert.match(seo, /siteName: 'RE:MIND'/)
  assert.match(seo, /summary_large_image/)
  assert.match(seo, /SHOP_SOCIAL_IMAGE = '\/shop\/hero-top\.jpg'/)
  assert.doesNotMatch(seo, /localhost|vercel\.app|waitlist/i)
})

test('main product structured data exposes only verified product facts', () => {
  const page = read('app/shop/page.tsx')
  const products = read('app/shop/productData.ts')

  assert.match(page, /'@type': 'Product'/)
  assert.match(page, /priceCurrency: 'NOK'/)
  assert.match(page, /availability: 'https:\/\/schema\.org\/InStock'/)
  assert.match(products, /price: 5990/)
  assert.doesNotMatch(page, /aggregateRating|reviewCount|gtin|mpn|sku/i)
})

test('robots and sitemap expose public shop pages without exposing private routes', () => {
  const robots = read('app/robots.ts')
  const sitemap = read('app/sitemap.ts')

  assert.match(robots, /disallow: \['\/api\/', '\/login', '\/test', '\/feedback'\]/)
  for (const path of ['/shop/configure', '/shop/frames', '/shop/mattes', '/shop/faq', '/privacy', '/terms']) {
    assert.match(sitemap, new RegExp(`'${path}'`))
  }
  assert.doesNotMatch(sitemap, /\/api\/|\/login|\/test|\/feedback/)
})
