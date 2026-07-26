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

test('final layered assets and their explicit catalogue order are preserved', () => {
  const framePaths = ['Dark.png', 'Metal.png', 'Oak.png', 'Walnut.png', 'White.png', 'Custom_Friends.png', 'Custom_Grinch.png', 'Custom_Snoopy.png']
  const mattePaths = ['Beige.png', 'Black.png', 'Black_White.png', 'Brown.png', 'Green.png', 'White.png', 'White_Black.png', 'Custom_Friends.png', 'Custom_Grinch.png', 'Custom_Snoopy.png']
  const matteIds = ['beige', 'black', 'black-white', 'brown', 'green', 'white', 'white-black', 'custom-friends', 'custom-grinch', 'custom-snoopy']
  assert.match(productData, /\/shop\/products\/frames\/\$\{filename\}/)
  for (const path of framePaths) assert.match(productData, new RegExp(path.replace('.', '\\.')))
  for (const path of mattePaths) assert.match(productData, new RegExp(path.replace('.', '\\.')))
  assert.ok(framePaths.every((path, index) => index === 0 || productData.indexOf(path) > productData.indexOf(framePaths[index - 1])))
  const mattes = productData.slice(productData.indexOf('export const shopMattes'))
  assert.ok(matteIds.every((id, index) => index === 0 || mattes.indexOf(`['${id}'`) > mattes.indexOf(`['${matteIds[index - 1]}'`)))
  assert.doesNotMatch(productData, /\/shop\/configurator\/(?:device|frames|mattes)/)
})

test('display is independent, defaults dark, and is persisted without entering price math', () => {
  assert.match(productData, /id: 'dark'.*\/shop\/products\/device\/Dark\.png/)
  assert.match(productData, /id: 'light'.*\/shop\/products\/device\/Light\.png/)
  assert.match(configurator, /useState<DisplayMode>\('dark'\)/)
  assert.match(configurator, /setSelectedDisplay\(item\.id\)/)
  assert.match(configurator, /display: selectedDisplay/)
  assert.match(cart, /display: DisplayMode/)
  assert.doesNotMatch(logic, /display/i)
  assert.doesNotMatch(configurator.slice(configurator.indexOf('function cycle'), configurator.indexOf('function addConfiguration')), /setSelectedDisplay/)
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

test('cart persists structured display, frame, and matte data', () => {
  assert.match(cart, /frame: Pick<ShopFrame/)
  assert.match(cart, /matte: Pick<ShopMatte/)
  assert.match(cart, /window\.localStorage\.setItem/)
  assert.match(configurator, /frame: \{ id: frame\.id, name: frame\.name, price: frame\.price \}/)
  assert.match(configurator, /matte: \{ id: matte\.id, name: matte\.name, price: matte\.price \}/)
  assert.match(configurator, /frameUpgrade,/)
  assert.match(configurator, /matteUpgrade,/)
})

test('configurator implementation contains no binary assets', () => {
  function files(path) {
    return readdirSync(path).flatMap((name) => {
      const entry = `${path}/${name}`
      return statSync(entry).isDirectory() ? files(entry) : [entry]
    })
  }
  assert.equal(files('app/shop/configure').some((path) => /\.(png|jpe?g|webp|gif|svg|ico|pdf)$/i.test(path)), false)
})

test('preview uses fixed, independent CSS placeholder layers', () => {
  assert.match(configurator, /function FramePlaceholder/)
  assert.match(configurator, /function MattePlaceholder/)
  assert.match(configurator, /function DevicePlaceholder/)
  assert.match(configurator, /<FramePlaceholder frameId=\{frame\.id\} \/>/)
  assert.match(configurator, /<MattePlaceholder matteId=\{matte\.id\} \/>/)
  assert.match(configurator, /<DevicePlaceholder display=\{display\.id\} \/>/)
  assert.match(configurator, /aspect-\[16\/9\].*max-w-\[960px\]/)
  assert.match(configurator, /frameAppearances\[frameId\]/)
  assert.match(configurator, /matteAppearances\[matteId\]/)
  assert.match(configurator, /FramePlaceholder[\s\S]*inset-\[8%\][\s\S]*inset-\[2\.25%\]/)
  assert.match(configurator, /MattePlaceholder[\s\S]*inset-x-\[24%\] inset-y-\[25%\]/)
  assert.match(configurator, /DevicePlaceholder[\s\S]*inset-x-\[28%\] inset-y-\[29%\]/)
  assert.doesNotMatch(configurator, /<img|previewSrc|configuratorPreviewSrc|NormalizedLayer/)
})
