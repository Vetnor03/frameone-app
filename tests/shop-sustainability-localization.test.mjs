import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/shop/sustainability/page.tsx', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../app/shop/CompanyPageShell.tsx', import.meta.url), 'utf8')

test('Sustainability provides the requested Norwegian copy while retaining English', () => {
  for (const copy of [
    'SLIK TENKER VI',
    'Designet for å vare lenger.',
    'Vi er fortsatt tidlig i reisen, men retningen er tydelig: færre og bedre produkter som forblir nyttige og passer inn i hjemmet i mange år.',
    'Teknologi skal passe inn i hjemmet – ikke ta over.',
    'LAGET FOR Å BLI',
    'FÆRRE, VALGT MED OMTANKE',
    'NYTTIG OVER TID',
    'FØLG OSS PÅ VEIEN',
    'Fremgang fremfor løfter.',
    'Vi skal fortsette å lære og dele tydeligere informasjon etter hvert som produksjonen vokser.',
  ]) assert.ok(page.includes(copy), `missing Norwegian copy: ${copy}`)

  for (const copy of [
    'Our approach',
    'Designed for a longer life.',
    'Calm technology should live well with what you already own.',
    'Made to stay',
    'Less, chosen well',
    'Useful by design',
    'Keep us accountable',
    'Progress over promises.',
  ]) assert.ok(page.includes(copy), `missing original English copy: ${copy}`)
})

test('Sustainability localizes only the back-link label and preserves its destination', () => {
  assert.match(page, /backLabel=\{isNorwegian \? 'TILBAKE TIL FORSIDEN' : 'Back to home'\}/)
  assert.match(shell, /href=\{`\/shop\?lang=\$\{language\}`\}/)
  assert.match(shell, /\{backLabel\}/)
})
