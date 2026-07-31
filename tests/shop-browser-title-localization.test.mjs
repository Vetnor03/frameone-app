import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop browser title follows the selected language without a page reload', () => {
  const title = read('app/shop/title.ts')
  const layout = read('app/shop/layout.tsx')
  const effects = read('app/shop/ShopRouteEffects.tsx')
  const selector = read('app/shop/ShopLanguageSelector.tsx')

  assert.match(title, /NORWEGIAN_SHOP_TITLE = 'RE:MIND \| Designet for hjemmet\. Skapt for hverdagen\.'/)
  assert.match(title, /ENGLISH_SHOP_TITLE = 'RE:MIND \| What matters\. Beautifully displayed\.'/)
  assert.match(layout, /new URLSearchParams\(location\.search\)\.get\('lang'\)==='no'/)
  assert.match(effects, /document\.title = NORWEGIAN_SHOP_TITLE/)
  assert.match(effects, /document\.title = html\.dataset\.shopPageTitle/)
  assert.doesNotMatch(effects, /useSearchParams/)
  assert.match(effects, /addEventListener\('popstate', syncTitle\)/)
  assert.match(selector, /router\.replace/)
  assert.doesNotMatch(selector, /window\.location\.href\s*=/)
})
