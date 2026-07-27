import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('standalone mattes retain and render their catalog placeholder figure in the cart', () => {
  const cart = read('app/shop/cart.ts')
  const cartPage = read('app/shop/cart/CartPage.tsx')
  const productDetail = read('app/shop/ProductDetailPage.tsx')

  assert.match(cart, /colors\?: \[string, string\]/)
  assert.match(productDetail, /colors: item\.colors/)
  assert.match(cartPage, /item\.productType === 'matte'/)
  assert.match(cartPage, /<PlaceholderFigure colors=\{item\.colors/)
  assert.match(cartPage, /item\.productType === 'matte' \? 'mattes' : 'frames'/)
})

test('cart renders missing frame art and configured devices with their selected placeholders', () => {
  const cartPage = read('app/shop/cart/CartPage.tsx')
  const configurator = read('app/shop/configure/Configurator.tsx')

  assert.match(cartPage, /!item\.imageSrc/)
  assert.match(cartPage, /item\.productType === 'matte' \? 'mattes' : 'frames'/)
  assert.match(cartPage, /<ConfigurationPlaceholder display=\{item\.display\} frameId=\{item\.frame\.id\} matteId=\{item\.matte\.id\}/)
  assert.match(configurator, /export function ConfigurationPlaceholder/)
})

test('continue shopping returns to the shop home', () => {
  const cartPage = read('app/shop/cart/CartPage.tsx')

  assert.match(cartPage, /href="\/shop"[^>]*>Continue shopping<\/a>/)
  assert.doesNotMatch(cartPage, /href="\/shop\/configure"[^>]*>Continue shopping<\/a>/)
})
