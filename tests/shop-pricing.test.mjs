import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('all storefront prices use the current VAT-inclusive price list', () => {
  const products = read('app/shop/productData.ts')
  const bundles = read('app/shop/bundleData.ts')

  assert.match(products, /name: 'RE:MIND',\s+price: 5990/)
  assert.equal(products.match(/price: 899/g)?.length, 4)
  assert.equal(products.match(/\[[^\n]+, 899, '#/g)?.length, 10)
  assert.equal(products.match(/\[[^\n]+, 229\]/g)?.length, 14)
  assert.match(bundles, /id: 'complete-home'[\s\S]*?price: 6390/)
  assert.match(bundles, /id: 'frame-pair'[\s\S]*?price: 1799/)
  assert.match(bundles, /id: 'style-library'[\s\S]*?price: 3190/)
})

test('catalog and secondary price surfaces consume the primary product prices', () => {
  const catalog = read('app/shop/catalogData.ts')
  const analytics = read('app/shop/analytics.ts')
  const faq = read('app/shop/faq/page.tsx')

  assert.match(catalog, /productPrice\(shopFrames, id\)/)
  assert.match(catalog, /productPrice\(shopMattes, id\)/)
  assert.doesNotMatch(catalog, /\b(?:5990|899|229)\b/)
  assert.match(analytics, /REMIND_BASE_PRICE = remindProduct\.price/)
  assert.match(faq, /formatNok\(remindProduct\.price, language\)/)
})
