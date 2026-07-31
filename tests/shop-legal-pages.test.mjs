import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop footer opens every legal page in the shop presentation', () => {
  const footer = read('app/shop/ShopChrome.tsx')

  for (const page of ['terms', 'privacy', 'cookies']) {
    assert.match(footer, new RegExp(`/${page}\\?from=shop&lang=`))
  }
})

test('shop footer legal links can scroll instead of clipping on narrow screens', () => {
  const footer = read('app/shop/ShopChrome.tsx')

  assert.match(footer, /tab-scroll[^\"]*overflow-x-auto[^\"]*whitespace-nowrap/)
  assert.equal((footer.match(/className="shop-footer-link shrink-0"/g) ?? []).length, 3)
})

test('shop legal pages use shared shop styling and return home', () => {
  const legalPage = read('app/components/ShopLegalPage.tsx')
  const terms = read('app/terms/page.tsx')
  const privacy = read('app/privacy/page.tsx')
  const cookies = read('app/cookies/page.tsx')

  assert.match(legalPage, /className="shop-page/)
  assert.match(legalPage, /backHref = '\/shop'/)
  assert.match(legalPage, /href=\{backHref\}/)
  assert.match(legalPage, /Back to home/)
  assert.match(terms, /from === 'shop'/)
  assert.match(privacy, /from === 'shop'/)
  assert.match(cookies, /from === 'shop'/)
})

test('terms page keeps English copy and fully localizes the Norwegian shop presentation', () => {
  const terms = read('app/terms/page.tsx')

  assert.match(terms, /These terms apply to the use of this app \(“the App”\), used to configure and manage your Frame device\./)
  assert.match(terms, /Disse vilkårene gjelder for bruk av denne appen \(«appen»\), som brukes til å konfigurere og administrere RE:MIND-enheten din\./)
  assert.match(terms, /title: 'BRUKERKONTO'/)
  assert.match(terms, /title: 'GJELDENDE LOV'/)
  assert.match(terms, /href="mailto:support@re-mind\.no"/)
  assert.match(terms, /backHref=\{language === 'no' \? '\/shop\?lang=no' : '\/shop'\}/)
  assert.match(terms, /backLabel=\{language === 'no' \? 'TILBAKE TIL FORSIDEN' : 'Back to home'\}/)
})

test('privacy page keeps English copy and fully localizes the Norwegian shop presentation', () => {
  const privacy = read('app/privacy/page.tsx')

  assert.match(privacy, /Your data is used to authenticate your account, sync with your Frame device, and provide core app functionality\./)
  assert.match(privacy, /Opplysningene brukes til å bekrefte brukerkontoen din, synkronisere med RE:MIND-enheten og levere appens grunnleggende funksjoner\./)
  assert.match(privacy, /title: 'OPPLYSNINGER VI SAMLER INN'/)
  assert.match(privacy, /title: 'DELING AV OPPLYSNINGER'/)
  assert.match(privacy, /href="https:\/\/www\.datatilsynet\.no\/"/)
  assert.match(privacy, /href="mailto:support@re-mind\.no"/)
  assert.match(privacy, /backHref=\{language === 'no' \? '\/shop\?lang=no' : '\/shop'\}/)
  assert.match(privacy, /backLabel=\{language === 'no' \? 'TILBAKE TIL FORSIDEN' : 'Back to home'\}/)
})

test('cookies policy documents the browser technologies actually in use', () => {
  const cookies = read('app/cookies/page.tsx')

  assert.match(cookies, /Supabase/)
  assert.match(cookies, /Vercel Web Analytics/)
  assert.match(cookies, /Local storage/)
  assert.match(cookies, /No advertising cookies/)
  assert.doesNotMatch(cookies, /placeholder|Replace with your real policy/i)
})
