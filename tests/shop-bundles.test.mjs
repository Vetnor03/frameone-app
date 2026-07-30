import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('bundle catalog omits the redundant starter set and offers only genuine discounts', async () => {
  const data = await read('app/shop/bundleData.ts')
  const catalog = await read('app/shop/bundles/page.tsx')
  const detail = await read('app/shop/bundles/[id]/page.tsx')
  assert.equal((data.match(/id: '/g) ?? []).length, 3)
  assert.doesNotMatch(data, /starter-set|Starter Set/)
  assert.match(data, /return remindProduct\.price/)
  assert.match(data, /frames\.slice\(1\)/)
  assert.match(data, /mattes\.slice\(1\)/)
  assert.match(data, /deviceCount: 1, frameCount: 2, matteCount: 2/)
  assert.match(data, /deviceCount: 0, frameCount: 2, matteCount: 1/)
  assert.match(catalog, /href={`\/shop\/bundles\/\${bundle\.id}\?lang=\${language}`}/)
  assert.match(detail, /<BundleConfigurator bundle={bundle}/)
  assert.match(detail, /const \{ id \} = await params/)
  assert.doesNotMatch(detail, /find\(\(item\) => item\.id === \(await params\)/)
})

test('bundle prices and savings follow the selected components separate prices', async () => {
  const data = await read('app/shop/bundleData.ts')
  const catalog = await read('app/shop/bundles/page.tsx')
  const configurator = await read('app/shop/bundles/[id]/BundleConfigurator.tsx')
  assert.doesNotMatch(data, /regularPrice:/)
  assert.match(catalog, /bundleRegularPrice\(bundle\)/)
  assert.match(configurator, /bundleRegularPrice\(bundle, framePrices, mattePrices\)/)
  assert.match(configurator, /bundleSavings\(bundle, framePrices, mattePrices\)/)
  assert.match(configurator, /'Kjøpt separat:' : 'Separately'/)
  assert.match(configurator, /formatNok\(regularPrice, language\)/)
  assert.match(configurator, /'Du sparer' : 'You save'/)
  assert.match(configurator, /formatNok\(saving, language\)/)
})

test('bundle cards keep savings and currency amounts together on narrow screens', async () => {
  const catalog = await read('app/shop/bundles/page.tsx')
  assert.match(catalog, /flex flex-wrap items-start/)
  assert.match(catalog, /shrink-0 whitespace-nowrap rounded-full/)
  assert.match(catalog, /flex flex-col gap-3 border-t[^\n]+sm:flex-row/)
  assert.match(catalog, /items-baseline gap-2 whitespace-nowrap/)
})

test('bundle catalog localizes Norwegian copy without changing English copy', async () => {
  const catalog = await read('app/shop/bundles/page.tsx')
  const data = await read('app/shop/bundleData.ts')

  for (const text of [
    'Tilbake til forsiden',
    'Gjør RE:MIND til din, til en bedre pris.',
    'Komplettpakken',
    'Rammepar',
    'Stilkolleksjonen',
    'Mest for pengene',
    'To nye uttrykk',
    'Mest valgfrihet',
  ]) assert.match(catalog, new RegExp(text))

  assert.match(catalog, /isNorwegian = language === 'no'/)
  assert.match(catalog, /isNorwegian \? 'Spar' : 'Save'/)
  assert.match(catalog, /matteCount === 1 \? 'matte' : 'mattes'/)
  assert.match(data, /name: 'The Complete Home'/)
  assert.match(data, /name: 'The Frame Pair'/)
  assert.match(data, /name: 'The Style Library'/)
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


test('bundle detail pages localize all Norwegian configurator copy while preserving English', async () => {
  const detail = await read('app/shop/bundles/[id]/page.tsx')
  const configurator = await read('app/shop/bundles/[id]/BundleConfigurator.tsx')

  for (const text of [
    'ALLE PAKKER',
    'Komplettpakken',
    'Rammepar',
    'Stilkolleksjonen',
    'MEST FOR PENGENE',
    'TO NYE UTTRYKK',
    'MEST VALGFRIHET',
    'Velg delene nedenfor og sett sammen pakken slik du vil.',
  ]) assert.match(detail, new RegExp(text))

  for (const text of [
    'VISNING',
    'Mørk',
    'Lys',
    'Mørk og lys visning følger med.',
    'RAMME',
    'INNLEGG',
    'Kjøpt separat:',
    'Du sparer',
    'LEGG PAKKEN I HANDLEKURV',
    'Alle valgte deler er inkludert i pakkeprisen.',
  ]) assert.match(configurator, new RegExp(text))

  assert.match(detail, /language === 'no'/)
  assert.match(detail, /description: `\$\{bundle.description\} Choose each component below to make the bundle yours\.`/)
  assert.match(configurator, /isNorwegian \? 'VISNING' : 'DISPLAY'/)
  assert.match(configurator, /isNorwegian \? 'LEGG PAKKEN I HANDLEKURV' : 'ADD BUNDLE TO CART'/)
})
