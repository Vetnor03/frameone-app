import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop price formatting uses the selected locale for the visible currency label', async () => {
  const productData = await read('app/shop/productData.ts')

  assert.match(productData, /locale === 'no' \? 'kr' : 'NOK'/)
  assert.match(productData, /value\.toLocaleString\('nb-NO'\)/)
})

test('every shop price surface passes its selected language to the shared formatter', async () => {
  const priceSurfaces = await Promise.all([
    'app/shop/page.tsx',
    'app/shop/CatalogPage.tsx',
    'app/shop/ProductDetailPage.tsx',
    'app/shop/configure/Configurator.tsx',
    'app/shop/bundles/page.tsx',
    'app/shop/bundles/[id]/BundleConfigurator.tsx',
    'app/shop/cart/CartPage.tsx',
    'app/shop/faq/page.tsx',
  ].map(read))

  for (const source of priceSurfaces) {
    const priceLines = source.split('\n').filter((line) => line.includes('formatNok('))
    assert.ok(priceLines.length > 0)
    assert.ok(priceLines.every((line) => line.includes('language')))
  }
})

test('shop navigation retains the selected locale between price surfaces', async () => {
  const chrome = await read('app/shop/ShopChrome.tsx')
  const catalog = await read('app/shop/CatalogPage.tsx')

  assert.match(chrome, /const shopHref = \(path: string\) => `\$\{path\}\?lang=\$\{language\}`/)
  assert.match(catalog, /encodeURIComponent\(item\.id\)\}\?lang=\$\{language\}/)
})
