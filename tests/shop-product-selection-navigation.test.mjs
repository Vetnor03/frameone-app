import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop product cards link to the configurator with their selection', () => {
  const home = read('app/shop/page.tsx')
  const catalog = read('app/shop/CatalogPage.tsx')

  assert.match(home, /href={`\/shop\/configure\?frame=\$\{encodeURIComponent\(card\.id\)\}/)
  assert.match(catalog, /kind === 'frames' \? 'frame' : 'matte'/)
  assert.match(catalog, /encodeURIComponent\(item\.id\)/)
})

test('the configurator initializes the selected frame and matte from the URL', () => {
  const page = read('app/shop/configure/page.tsx')
  const configurator = read('app/shop/configure/Configurator.tsx')

  assert.match(page, /initialFrameId={params\?\.frame}/)
  assert.match(page, /initialMatteId={params\?\.matte}/)
  assert.match(configurator, /shopFrames\.some\(\(item\) => item\.id === initialFrameId\)/)
  assert.match(configurator, /shopMattes\.some\(\(item\) => item\.id === initialMatteId\)/)
})
