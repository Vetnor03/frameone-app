import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Privacy Policy discloses Google Calendar usage in both languages', () => {
  const policy = read('app/privacy/page.tsx')
  for (const text of [
    'GOOGLE CALENDAR – ACCESS AND PURPOSE',
    'GOOGLE CALENDAR – TILGANG OG FORMÅL',
    'calendar.readonly',
    'GOOGLE CALENDAR – DISCONNECTING AND DELETION',
    'GOOGLE CALENDAR – FRAKOBLING OG SLETTING',
    'Google API Services User Data Policy',
    'Limited Use',
  ]) assert.ok(policy.includes(text), text)
})

test('Terms disclose optional Google connection and shared frame visibility', () => {
  const terms = read('app/terms/page.tsx')
  assert.match(terms, /CONNECTED SERVICES AND GOOGLE CALENDAR/)
  assert.match(terms, /TILKOBLEDE TJENESTER OG GOOGLE CALENDAR/)
  assert.match(terms, /shared space/)
  assert.match(terms, /fellesrom/)
})
