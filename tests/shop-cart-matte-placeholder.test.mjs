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
  assert.match(cartPage, /kind="mattes"/)
})
