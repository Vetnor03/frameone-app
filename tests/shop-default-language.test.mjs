import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop locale defaults to Norwegian without consulting browser language', () => {
  const language = read('app/shop/language.ts')
  const middleware = read('app/middleware.ts')

  assert.match(language, /isShopLocale\(value\) \? value : 'no'/)
  assert.doesNotMatch(language + middleware, /navigator\.language|accept-language/i)
  assert.match(middleware, /pathname === '\/shop' \|\| pathname\.startsWith\('\/shop\/'\)/)
  assert.match(middleware, /isShopLocale\(savedLanguage\) \? savedLanguage : 'no'/)
})

test('manual language choices are persisted and used on later direct visits', () => {
  const selector = read('app/shop/ShopLanguageSelector.tsx')
  const middleware = read('app/middleware.ts')

  assert.match(selector, /document\.cookie = `\$\{SHOP_LANGUAGE_COOKIE\}=\$\{nextLanguage\}/)
  assert.match(middleware, /request\.cookies\.get\(SHOP_LANGUAGE_COOKIE\)/)
  assert.match(middleware, /url\.searchParams\.set\('lang', isShopLocale\(savedLanguage\) \? savedLanguage : 'no'\)/)
  assert.match(middleware, /response\.cookies\.set\(SHOP_LANGUAGE_COOKIE, requestedLanguage/)
})
