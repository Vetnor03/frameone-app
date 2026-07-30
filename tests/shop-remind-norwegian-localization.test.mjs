import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shopPage = readFileSync(new URL('../app/shop/page.tsx', import.meta.url), 'utf8')
const shopChrome = readFileSync(new URL('../app/shop/ShopChrome.tsx', import.meta.url), 'utf8')
const newsletterForm = readFileSync(new URL('../app/shop/NewsletterForm.tsx', import.meta.url), 'utf8')

test('RE:MIND product section localizes only its Norwegian copy', () => {
  assert.match(shopPage, /language === 'no' \? 'Komplett fra' : 'Complete RE:MIND from'/)
  assert.match(shopPage, /language === 'no' \? 'DETTE FØLGER MED' : 'What’s included'/)
  assert.match(shopPage, /language === 'no' \? 'RE:MIND · Valgfri ramme · Valgfritt innlegg · Ladekabel · Oppstartsveiledning' : 'RE:MIND display · Your frame · Your matte · Charging cable · Setup guide'/)
  assert.match(shopPage, /language === 'no' \? 'VELG STIL' : 'MAKE IT YOURS'/)
})

test('mattes promo uses Innlegg and localized copy only for Norwegian', () => {
  assert.match(shopPage, /language === 'no' \? 'INNLEGG' : 'Mattes'/)
  assert.match(shopPage, /language === 'no' \? 'Nytt uttrykk til rammen\.' : <>Change the feel\.<br \/>Not the frame\.<\/>/)
  assert.match(shopPage, /language === 'no' \? 'Et innlegg for hvert rom, hver stil og hver årstid\.' : <>Choose the perfect matte to match<br \/>your space and reduce glare\.<\/>/)
  assert.match(shopPage, /language === 'no' \? 'SE UTVALGET' : 'SHOP MATTES'/)
})

test('footer provides Norwegian labels while preserving the English copy', () => {
  for (const label of [
    'BUTIKK', 'HJELP', 'FAQ', 'Frakt', 'Retur', 'Garanti', 'OM RE:MIND', 'Om oss',
    'Bærekraft', 'Kontakt', 'Presse', 'HOLD DEG OPPDATERT',
    'Nye rammer, oppdateringer og ideer.', 'Din e-post',
    '© 2026 RE:MIND. Alle rettigheter forbeholdt.', 'Vilkår', 'Personvern', 'Informasjonskapsler',
  ]) {
    assert.match(shopChrome, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  for (const label of [
    'SHOP', 'SUPPORT', 'Shipping', 'Returns', 'Warranty', 'COMPANY', 'About',
    'Sustainability', 'Contact', 'Press', 'STAY IN THE LOOP',
    'New frames, updates and ideas.', 'Your email',
    '© 2026 RE:MIND. All rights reserved.', 'Terms', 'Privacy', 'Cookies',
  ]) {
    assert.match(shopChrome, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.match(newsletterForm, /placeholder=\{placeholder\}/)
  assert.match(newsletterForm, /'Takk! Du er på listen\.'/)
  assert.match(newsletterForm, /'Denne e-postadressen er allerede registrert\.'/)
  assert.match(newsletterForm, /'Noe gikk galt\. Prøv igjen\.'/)
  assert.match(newsletterForm, /'Skriv inn en gyldig e-postadresse\.'/)
  assert.match(newsletterForm, /'Thank you for joining our newsletter! Please check your inbox\.'/)
  assert.match(newsletterForm, /'Something went wrong\. Please try again\.'/)
})
