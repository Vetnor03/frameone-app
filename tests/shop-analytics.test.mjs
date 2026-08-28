import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

test('shop analytics has typed, consistent funnel definitions and the correct commercial constants', () => {
  const analytics = read('app/shop/analytics.ts')
  for (const event of ['shop_view', 'product_view', 'configurator_open', 'frame_selected', 'matte_selected', 'add_to_cart', 'cart_view', 'begin_checkout']) {
    assert.match(analytics, new RegExp(`\\b${event}:`))
  }
  assert.match(analytics, /REMIND_BASE_PRICE = remindProduct\.price/)
  assert.match(analytics, /SHOP_CURRENCY = 'NOK'/)
  assert.doesNotMatch(analytics, /2229/)
  assert.doesNotMatch(analytics, /email|phone|address|prompt|reminder_text/i)
})

test('analytics is production-only, honors Do Not Track, and leaves checkout and purchase disconnected', () => {
  const analytics = read('app/shop/analytics.ts')
  const cart = read('app/shop/cart/CartPage.tsx')
  assert.match(analytics, /NEXT_PUBLIC_VERCEL_ENV !== 'production'/)
  assert.match(analytics, /navigator\.doNotTrack === '1'/)
  assert.doesNotMatch(cart, /trackShopEvent\('begin_checkout'/)
  assert.doesNotMatch(analytics, /purchase:/)
})

test('configuration analytics only tracks user selection handlers and successful cart writes', () => {
  const configurator = read('app/shop/configure/Configurator.tsx')
  const writeIndex = configurator.indexOf("addCartItem({")
  const addEventIndex = configurator.indexOf("trackShopEvent('add_to_cart'")
  assert.ok(writeIndex >= 0 && addEventIndex > writeIndex)
  assert.match(configurator, /onChange=\{\(event\) => selectFrame\(event\.target\.value\)\}/)
  assert.match(configurator, /onChange=\{\(event\) => selectMatte\(event\.target\.value\)\}/)
  assert.doesNotMatch(configurator.slice(0, configurator.indexOf('function selectFrame')), /trackShopEvent\('(frame|matte)_selected'/)
})
