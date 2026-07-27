import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('bundle catalog offers four discounted configurations and dedicated detail routes', async () => {
  const data = await read('app/shop/bundleData.ts')
  const catalog = await read('app/shop/bundles/page.tsx')
  const detail = await read('app/shop/bundles/[id]/page.tsx')
  assert.equal((data.match(/id: '/g) ?? []).length, 4)
  assert.match(data, /deviceCount: 1, frameCount: 2, matteCount: 2/)
  assert.match(data, /deviceCount: 0, frameCount: 2, matteCount: 1/)
  assert.match(catalog, /href={`\/shop\/bundles\/\${bundle\.id}`}/)
  assert.match(detail, /<BundleConfigurator bundle={bundle}/)
  assert.match(detail, /const \{ id \} = await params/)
  assert.doesNotMatch(detail, /find\(\(item\) => item\.id === \(await params\)/)
})

test('bundle configurator selects every component and stores one discounted cart item', async () => {
  const configurator = await read('app/shop/bundles/[id]/BundleConfigurator.tsx')
  const cart = await read('app/shop/cart.ts')
  assert.match(configurator, /frameIds\.map/)
  assert.match(configurator, /matteIds\.map/)
  assert.match(configurator, /ADD BUNDLE TO CART/)
  assert.match(configurator, /const cartItem: BundleCartItem/)
  assert.match(configurator, /totalPrice: bundle\.price/)
  assert.match(configurator, /addCartItem\(cartItem\)/)
  assert.match(cart, /productType: 'bundle'/)
  assert.match(cart, /frames: Array/)
  assert.match(cart, /mattes: Array/)
})
