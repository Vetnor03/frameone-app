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

test('Terms disclose optional Google Calendar and Google Tasks connections and shared frame visibility', () => {
  const terms = read('app/terms/page.tsx')
  assert.match(terms, /CONNECTED SERVICES, GOOGLE CALENDAR AND GOOGLE TASKS/)
  assert.match(terms, /TILKOBLEDE TJENESTER, GOOGLE CALENDAR OG GOOGLE TASKS/)
  assert.match(terms, /read-only/)
  assert.match(terms, /shared space/)
  assert.match(terms, /fellesrom/)
})

test('Privacy Policy discloses Google Tasks read-only scope, visibility and disconnection in both languages', () => {
  const policy = read('app/privacy/page.tsx')
  for (const text of [
    'GOOGLE TASKS – ACCESS, STORAGE AND DISCONNECTING',
    'GOOGLE TASKS – TILGANG, LAGRING OG FRAKOBLING',
    'tasks.readonly',
    'unfinished tasks with due dates',
    'ufullførte oppgaver med forfallsdato',
    'shared frame',
    'delt ramme',
    'imported Google Tasks entries',
    'Google Calendar or Google Tasks feature',
  ]) assert.ok(policy.includes(text), text)
})
