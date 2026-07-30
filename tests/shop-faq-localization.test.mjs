import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const faqPage = readFileSync(new URL('../app/shop/faq/page.tsx', import.meta.url), 'utf8')

test('FAQ provides the complete requested Norwegian copy without replacing English copy', () => {
  for (const copy of [
    'Ofte stilte spørsmål',
    'Her finner du nyttig informasjon før RE:MIND kommer hjem til deg.',
    'Hva er RE:MIND?',
    'Hva følger med RE:MIND?',
    'Hvordan setter jeg den opp?',
    'Trenger RE:MIND Wi-Fi?',
    'Hvor ofte oppdateres den?',
    'Trenger jeg appen?',
    'Kan flere bruke samme RE:MIND?',
    'Kan jeg ha mer enn én RE:MIND?',
    'Kan jeg bytte ramme eller innlegg senere?',
    'Kan RE:MIND henges på veggen?',
    'Må RE:MIND stå tilkoblet strøm?',
    'Hvordan lader jeg den?',
    'Hva skjer når batteriet blir utslitt?',
    'Krever RE:MIND et abonnement?',
    'Hva skjer hvis noe går i stykker?',
    'Hvordan fungerer åpent kjøp?',
    'Hvor sender dere?',
    'Trenger du mer hjelp?',
  ]) assert.match(faqPage, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  assert.match(faqPage, /isNorwegian \? 'Ofte stilte spørsmål' : 'Frequently asked questions'/)
  assert.match(faqPage, /isNorwegian \? 'Hva er RE:MIND\?' : 'What is RE:MIND\?'/)
})

test('Norwegian FAQ preserves every inline anchor and carries its locale to internal destinations', () => {
  for (const [path, label] of [
    ['/shop/sustainability', 'siden om bærekraft'],
    ['/shop/warranty', 'garantisiden'],
    ['/shop/returns', 'retursiden'],
    ['/shop/shipping', 'fraktsiden'],
    ['/shop/contact', 'kontaktsiden'],
  ]) {
    assert.match(faqPage, new RegExp(`href=\\{localizedHref\\('${path}'\\)\\}>${label}</a>`))
    assert.match(faqPage, new RegExp(`href="${path}">`))
  }

  assert.match(faqPage, /const localizedHref = \(href: string\) => isNorwegian \? `\$\{href\}\?lang=no` : href/)
  assert.match(faqPage, /backHref=\{localizedHref\('\/shop'\)\}/)
})
