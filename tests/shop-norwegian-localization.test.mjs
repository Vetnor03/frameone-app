import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop locale is persisted and restored by middleware', () => {
  const selector = read('app/shop/ShopLanguageSelector.tsx')
  const middleware = read('app/middleware.ts')
  assert.match(selector, /remind-shop-language/)
  assert.match(selector, /remind-shop-lang=.*Max-Age=31536000/)
  assert.match(middleware, /pathname\.startsWith\('\/shop'\)/)
  assert.match(middleware, /savedShopLanguage/)
})

test('Norwegian localization covers navigation, commerce, forms and legal content', () => {
  const locale = read('app/shop/ShopLocaleBridge.tsx')
  for (const copy of ['Rammer', 'Passepartouter', 'Handlekurven din', 'GÅ TIL KASSEN', 'E-postadresse', 'Returfrist', '5 ÅRS GARANTI']) {
    assert.ok(locale.includes(copy), `missing Norwegian copy: ${copy}`)
  }
  assert.match(locale, /querySelectorAll<HTMLAnchorElement>\('a\[href\]'\)/)
  assert.match(locale, /url\.searchParams\.set\('lang', 'no'\)/)
  assert.match(locale, /document\.documentElement\.lang = language === 'no' \? 'nb'/)
})

test('Norwegian dictionary does not contain duplicate source keys', () => {
  const locale = read('app/shop/ShopLocaleBridge.tsx')
  const dictionary = locale.split('const nb:', 2)[1].split('\n}', 1)[0]
  const keys = [...dictionary.matchAll(/(?:^|[, ]+)(['"])(.*?)\1\s*:/gm)].map((match) => match[2])
  assert.equal(new Set(keys).size, keys.length)
})
