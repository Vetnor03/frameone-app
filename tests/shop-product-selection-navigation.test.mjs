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

test('desktop and phone menus lead with RE:MIND linking to the frame builder', () => {
  const chrome = read('app/shop/ShopChrome.tsx')
  const configurePage = read('app/shop/configure/page.tsx')
  const remindMenuLink = /<a href="\/shop\/configure" className=\{`pb-1 \$\{activeSection === "configure"[^>]*>[\s\S]*?RE:MIND[\s\S]*?<\/a>/g

  assert.equal(chrome.match(remindMenuLink)?.length, 2)
  assert.ok(chrome.indexOf('href="/shop/configure"') < chrome.indexOf('href="/shop/frames"'))
  assert.match(configurePage, /<ShopHeader language=\{language\} activeSection="configure" \/>/)
})

test('frame and matte pages can add the selected standalone product to cart', () => {
  const detail = read('app/shop/ProductDetailPage.tsx')
  const framePage = read('app/shop/frames/[id]/page.tsx')
  const mattePage = read('app/shop/mattes/[id]/page.tsx')

  assert.match(framePage, /<ProductDetailPage kind="frames" item=\{item\}/)
  assert.match(mattePage, /<ProductDetailPage kind="mattes" item=\{item\}/)
  assert.match(detail, /ADD TO CART/)
  assert.match(detail, /addCartItem\(\{/)
  assert.match(detail, /productType: singular/)
  assert.doesNotMatch(detail, /BUILD YOUR RE:MIND/)
})

test('shop back-to-home links return to the shop landing page', () => {
  const configurator = read('app/shop/configure/Configurator.tsx')
  const catalog = read('app/shop/CatalogPage.tsx')
  const styles = read('app/shop/configure/Configurator.module.css')

  assert.match(configurator, /href="\/shop"[\s\S]{0,400}Back to home/)
  assert.match(catalog, /href="\/shop"[\s\S]{0,400}Back to home/)
  assert.match(configurator, /styles\.backLink/)
  assert.match(styles, /\.backLink\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?grid-row:\s*1;[\s\S]*?justify-self:\s*start;/)
})

test('build your frame desktop content starts compactly below the shop header', () => {
  const styles = read('app/shop/configure/Configurator.module.css')

  assert.match(styles, /\.desktopLayout\s*\{[\s\S]*?row-gap:\s*2rem;[\s\S]*?padding:\s*2rem clamp\(2\.5rem, 5vw, 5\.5rem\) 5rem;/)
})

test('the configurator can still initialize a selection from a product page', () => {
  const page = read('app/shop/configure/page.tsx')
  const configurator = read('app/shop/configure/Configurator.tsx')

  assert.match(page, /initialFrameId={params\?\.frame}/)
  assert.match(page, /initialMatteId={params\?\.matte}/)
  assert.match(configurator, /purchasableFrames\.some\(\(item\) => item\.id === initialFrameId\)/)
  assert.match(configurator, /shopMattes\.some\(\(item\) => item\.id === initialMatteId\)/)
})
