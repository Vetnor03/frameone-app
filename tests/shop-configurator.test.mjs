import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const page = read('app/shop/configure/page.tsx')
const configurator = read('app/shop/configure/Configurator.tsx')
const productData = read('app/shop/productData.ts')
const shopPage = read('app/shop/page.tsx')
const logic = read('app/shop/configuratorLogic.ts')
const cart = read('app/shop/cart.ts')
const chrome = read('app/shop/ShopChrome.tsx')

test('configure route and both shop entry points are present', () => {
  assert.match(page, /<Configurator \/>/)
  assert.match(configurator, /BUILD YOUR RE:MIND/)
  assert.match(configurator, /Find the combination that feels like home\./)
  assert.match(shopPage, /const configureHref = `\/shop\/configure\?lang=\$\{language\}&currency=\$\{currency\}`/)
  assert.match(shopPage, /href=\{configureHref\}>SHOP FRAMES/)
  assert.match(shopPage, /href=\{configureHref\}[\s\S]{0,180}MAKE IT YOURS/)
})

test('shop and configurator share the complete storefront chrome', () => {
  assert.match(shopPage, /<ShopHeader language=\{language\} currency=\{currency\}/)
  assert.match(shopPage, /<ShopFooter language=\{language\} currency=\{currency\}/)
  assert.match(page, /<ShopHeader language=\{language\} currency=\{currency\} \/>/)
  assert.match(page, /<ShopFooter language=\{language\} currency=\{currency\} \/>/)
  assert.match(chrome, /Open profile/)
  assert.match(chrome, /FREE SHIPPING/)
  assert.match(chrome, /STAY IN THE LOOP/)
  assert.match(chrome, /ShopLocaleCurrencySelector/)
})

test('shop and configure routes use the same page scroll container', () => {
  const scrollContainer = /shop-page h-screen overflow-y-auto overflow-x-hidden/
  assert.match(shopPage, scrollContainer)
  assert.match(page, scrollContainer)
  assert.match(page, /shop-shell w-full max-w-\[2560px\] mx-auto bg-white 2xl:max-w-\[1720px\]/)
})

test('shop and configurator consume one shared frame source', () => {
  assert.match(shopPage, /import \{ formatNok, shopFrames \} from '\.\/productData'/)
  assert.match(configurator, /shopFrames, shopMattes/)
  assert.equal((productData.match(/name: '(Midnight Black|Walnut Wood|Natural Oak|Cloud White)'/g) ?? []).length, 4)
})

test('combination cycling is deterministic and wraps both ways', () => {
  const cycle = (current, direction, total) => (current + direction + total) % total
  assert.equal(cycle(7, 1, 8), 0)
  assert.equal(cycle(0, -1, 8), 7)
  assert.match(logic, /frameIndex \* matteCount \+ matteIndex/)
  assert.match(logic, /\(current \+ direction \+ total\) % total/)
})

test('direct selectors update only their selected dimension', () => {
  assert.match(configurator, /onChange=\{\(event\) => \{ setFrameId\(event\.target\.value\); setAdded\(false\) \}\}/)
  assert.match(configurator, /onChange=\{\(event\) => \{ setMatteId\(event\.target\.value\); setAdded\(false\) \}\}/)
})

test('pricing charges only upgrades over the cheapest included options', () => {
  assert.match(productData, /price: number \| null/)
  assert.match(logic, /selectedPrice - Math\.min/)
  assert.match(logic, /selectedPrice === null\) return 0/)
  assert.match(logic, /basePrice \+ frameUpgrade \+ matteUpgrade/)
  assert.doesNotMatch(configurator, /Price pending|Pending matte price/)
})

test('cart persists structured frame and matte data', () => {
  assert.match(cart, /frame: Pick<ShopFrame/)
  assert.match(cart, /matte: Pick<ShopMatte/)
  assert.match(cart, /window\.localStorage\.setItem/)
  assert.match(configurator, /frame: \{ id: frame\.id, name: frame\.name, price: frame\.price \}/)
  assert.match(configurator, /matte: \{ id: matte\.id, name: matte\.name, price: matte\.price \}/)
  assert.match(configurator, /frameUpgrade,/)
  assert.match(configurator, /matteUpgrade,/)
})

test('placeholder layer paths exist only as code references', () => {
  assert.match(productData, /\/shop\/configurator\/device\.png/)
  for (const id of ['midnight-black', 'walnut-wood', 'natural-oak', 'cloud-white']) {
    assert.match(productData, new RegExp(`/shop/configurator/frames/${id}\\.png`))
  }

  function files(path) {
    return readdirSync(path).flatMap((name) => {
      const entry = `${path}/${name}`
      return statSync(entry).isDirectory() ? files(entry) : [entry]
    })
  }
  assert.equal(files('app/shop/configure').some((path) => /\.(png|jpe?g|webp|gif|svg|ico|pdf)$/i.test(path)), false)
})
