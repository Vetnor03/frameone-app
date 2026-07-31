import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop browser title follows the selected language without a page reload', () => {
  const title = read('app/shop/title.ts')
  const layout = read('app/shop/layout.tsx')
  const effects = read('app/shop/ShopRouteEffects.tsx')
  const selector = read('app/shop/ShopLanguageSelector.tsx')
  const page = read('app/shop/page.tsx')

  assert.match(title, /NORWEGIAN_SHOP_TITLE = 'RE:MIND \| Designet for hjemmet\. Skapt for hverdagen\.'/)
  assert.match(title, /ENGLISH_SHOP_TITLE = 'RE:MIND \| What matters\. Beautifully present\.'/)
  assert.match(layout, /new URLSearchParams\(location\.search\)\.get\('lang'\)/)
  assert.match(effects, /language === 'no' \? NORWEGIAN_SHOP_TITLE : ENGLISH_SHOP_TITLE/)
  assert.match(effects, /meta\[property="og:title"\]/)
  assert.match(effects, /meta\[name="twitter:title"\]/)
  assert.doesNotMatch(effects, /useSearchParams/)
  assert.match(effects, /addEventListener\('popstate', syncTitle\)/)
  assert.match(selector, /router\.replace/)
  assert.match(selector, /document\.title = title/)
  assert.doesNotMatch(selector, /window\.location\.href\s*=/)
  assert.match(page, /export async function generateMetadata/)
  assert.match(page, /language === 'no' \? NORWEGIAN_SHOP_TITLE : ENGLISH_SHOP_TITLE/)
  assert.match(page, /shopMetadata\(/)
})
