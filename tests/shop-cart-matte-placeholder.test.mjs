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

  assert.match(cartPage, /href=\{`\/shop\?lang=\$\{language\}`\}[^>]*>\{isNorwegian \? 'Fortsett å handle' : 'Continue shopping'\}<\/a>/)
  assert.doesNotMatch(cartPage, /href="\/shop\/configure"[^>]*>Continue shopping<\/a>/)
})

test('cart localizes Norwegian empty and populated states while retaining English copy', () => {
  const cartPage = read('app/shop/cart/CartPage.tsx')

  for (const text of [
    'Handlekurv', 'Se over valgene dine før du går videre til betaling.', 'Handlekurven er tom',
    'Sett sammen en RE:MIND som passer hjemmet ditt.', 'TILPASS DIN RE:MIND', 'Ramme: ',
    'Innlegg: ', 'Antall', 'Fjern', 'Fortsett å handle', 'Oppsummering', 'Rabattkode',
    'Skriv inn kode', 'BRUK', 'Delsum', 'Frakt', 'Gratis', 'Totalt', 'TIL BETALING',
    'Mva. inkludert. Sikker betaling.', 'Rabattkoden er lagt til.',
    'Rabattkoden kunne ikke brukes.', 'Skriv inn en rabattkode.',
  ]) assert.ok(cartPage.includes(text), `missing Norwegian cart copy: ${text}`)

  for (const text of [
    'Your cart', 'Review your selections before checkout.', 'Your cart is empty',
    'Build a RE:MIND that feels right at home.', 'BUILD YOUR RE:MIND', 'Frame: ', 'Matte: ',
    'Qty', 'Remove', 'Continue shopping', 'Order summary', 'Discount code', 'Enter code',
    'APPLY', 'Subtotal', 'Shipping', 'Free', 'Total', 'CHECKOUT',
    'Taxes included. Secure checkout.', 'Discount code applied — 10% off.',
    'This discount code is not valid.',
  ]) assert.ok(cartPage.includes(text), `missing unchanged English cart copy: ${text}`)

  assert.match(cartPage, /matteDisplayName\(item\.matte\.id, item\.matte\.name, language\)/)
  assert.match(cartPage, /item\.mattes\.map\(\(part\) => matteDisplayName\(part\.id, part\.name, language\)\)/)
  assert.match(cartPage, /norwegianBundleNames/)
})
