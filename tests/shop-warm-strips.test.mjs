import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shopPage = readFileSync(new URL('../app/shop/page.tsx', import.meta.url), 'utf8')
const globalStyles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('shop warm color is applied to all three full-width strip wrappers', () => {
  assert.match(globalStyles, /\.shop-page \.shop-warm-strip\s*\{\s*background-color:\s*#f5f1ea;/i)
  assert.equal(shopPage.match(/shop-warm-strip/g)?.length, 3)
  assert.match(shopPage, /<header className="shop-warm-strip shop-main-navigation">/)
  assert.match(shopPage, /<section className="shop-warm-strip w-full border-y border-black\/10">/)
  assert.match(shopPage, /<div className="shop-warm-strip border-b border-black\/10">/)
})

test('shop navigation wrapper has the requested full-width divider', () => {
  assert.match(globalStyles, /\.shop-page \.shop-main-navigation\s*\{\s*border-bottom:\s*1px solid #ddd7cf;/i)
})
