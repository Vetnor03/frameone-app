import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const catalogueText = readFileSync(new URL('../app/lib/integrations/catalog.ts', import.meta.url), 'utf8')
const modalText = readFileSync(new URL('../app/components/BonnetidSetupModal.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('IRN is available, after Google Calendar and before Local Events', () => {
  const google = catalogueText.indexOf("key: 'google-calendar'")
  const irn = catalogueText.indexOf("key: 'bonnetid'")
  const localEvents = catalogueText.indexOf("key: 'local-events'")
  assert.ok(google >= 0 && irn > google && localEvents > irn)
  const line = catalogueText.split('\n').find(line => line.includes("key: 'bonnetid'"))
  assert.match(line, /status: 'available', connectable: true/)
  assert.doesNotMatch(line, /experimental/)
  // Leave connected-first behavior intact when a user already connected a provider.
  assert.match(home, /sortConnectedAppsFirst\(apps\.map\(app => \(\{ app, connected: getAppConnected\(app\) \}\)\)\)/)
})

test('Choosing a location displays the exact chosen name, never appended search tail', () => {
  assert.match(modalText, /const visibleCity = selected\?\.name \?\? query/)
  assert.match(modalText, /function selectCity\(city: City\) \{\s*setSelected\(city\)\s*setQuery\(''\)/)
  assert.match(modalText, /value=\{visibleCity\}/)
  assert.match(modalText, /readOnly=\{!!selected\}/)
  assert.match(modalText, /onClick=\{\(\) => selectCity\(city\)\}/)
  assert.match(modalText, /onSaved\(true, selected\.name\)/)
  assert.doesNotMatch(modalText, /setQuery\(city\.name\)/)
})

test('IRN modal no longer shows Experimental badge or description', () => {
  assert.doesNotMatch(modalText, /Eksperimentell integrasjon|Experimental integration/)
  assert.match(modalText, /Offisielle bønnetider og merkedager fra IRN/)
})
