import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop product cards link to dedicated product pages', () => {
  const home = read('app/shop/page.tsx')
  const catalog = read('app/shop/CatalogPage.tsx')

  assert.match(home, /href={`\/shop\/frames\/\$\{encodeURIComponent\(card\.id\)\}/)
  assert.match(catalog, /href={`\/shop\/\$\{kind\}\/\$\{encodeURIComponent\(item\.id\)\}`}/)
  assert.match(catalog, /encodeURIComponent\(item\.id\)/)
})

test('frame and matte pages show only the selected product before configuration', () => {
  const detail = read('app/shop/ProductDetailPage.tsx')
  const framePage = read('app/shop/frames/[id]/page.tsx')
  const mattePage = read('app/shop/mattes/[id]/page.tsx')

  assert.match(framePage, /<ProductDetailPage kind="frames" item=\{item\}/)
  assert.match(mattePage, /<ProductDetailPage kind="mattes" item=\{item\}/)
  assert.match(detail, /BUILD WITH THIS \{singular\.toUpperCase\(\)\}/)
  assert.match(detail, /\/shop\/configure\?\$\{singular\}=\$\{encodeURIComponent\(item\.id\)\}/)
  assert.doesNotMatch(detail, /BUILD YOUR RE:MIND/)
})

test('the configurator can still initialize a selection from a product page', () => {
  const page = read('app/shop/configure/page.tsx')
  const configurator = read('app/shop/configure/Configurator.tsx')

  assert.match(page, /initialFrameId={params\?\.frame}/)
  assert.match(page, /initialMatteId={params\?\.matte}/)
  assert.match(configurator, /shopFrames\.some\(\(item\) => item\.id === initialFrameId\)/)
  assert.match(configurator, /shopMattes\.some\(\(item\) => item\.id === initialMatteId\)/)
})
