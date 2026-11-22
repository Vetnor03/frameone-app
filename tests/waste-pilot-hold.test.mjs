import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { integrationActiveForPilot, INTEGRATION_CATALOGUE } from '../app/lib/integrations/catalog.ts'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Renovasjon is connectable while other evaluation-only apps stay disabled', () => {
  const waste = INTEGRATION_CATALOGUE.find(app => app.key === 'waste')
  assert.equal(waste.status, 'experimental')
  assert.equal(waste.connectable, true)
  assert.equal(integrationActiveForPilot('waste'), true)
  for (const key of ['teams', 'google-calendar', 'local-events', 'spond']) {
    assert.equal(integrationActiveForPilot(key), true, key + ' stays active')
  }
  for (const key of ['vigilo', 'transponder', 'planta']) {
    assert.equal(integrationActiveForPilot(key), false, key + ' stays under evaluation')
  }
})

test('Connect offers waste address search, DISCONNECT and Edit while preserving other gates', () => {
  const ui = read('../app/HomePageClient.tsx')
  assert.match(ui, /INTEGRATION_CATALOGUE\.map\(definition => definition\.key === 'google-tasks' && googleTasksEligible[\s\S]*?\.filter\(definition => !startup \|\| \(definition\.connectable/)
  assert.match(ui, /!app\.connectable \? \(/)
  assert.match(ui, /app\.key === 'waste' \? \(/)
  assert.match(ui, /setWasteModalOpen\(true\)/)
  assert.match(ui, /setDisconnectConfirmApp\('waste'\)/)
  assert.match(ui, /wasteStatusResolved/)
  assert.match(ui, /setWasteConnected\(json.connected === true\)/)
  assert.match(ui, /WasteSetupModal language=\{language\}/)
  const modal = read('../app/components/WasteSetupModal.tsx')
  assert.match(modal, /\/api\/integrations\/waste\/search/)
  assert.match(modal, /results\.map\(a => <button/)
  assert.match(modal, /\/api\/integrations\/waste\/connect/)
  assert.match(modal, /\/api\/integrations\/waste\/disconnect/)
})

test('Authenticated connect supports national search, mapped static calendars and official supported providers', () => {
  const route = read('../app/api/integrations/waste/connect/route.ts')
  const server = read('../app/lib/integrations/waste/server.ts')
  assert.match(route, /getAuthenticatedUserId\(req\)/)
  assert.match(route, /if \(!integrationActiveForPilot\('waste'\)\)/)
  assert.match(server, /resolvePilotWasteAddress\(address\)/)
  assert.match(server, /family: 'pilot_manual'/)
  assert.doesNotMatch(server, /searchPilotWasteAddresses/)
  assert.match(server, /export async function searchWasteAddresses\(query: string\) \{[^}]*return searchKartverketAddresses\(query\)\s*\}/)
  assert.match(server, /pilotWasteScheduleForAddress\(street, house, postal\)/)
  assert.match(server, /searchKartverketAddresses\(query\)/)
  assert.match(server, /providerForAddress\(address\)/)
  assert.doesNotMatch(server, /only available for the six test addresses/)
})

test('Cron keeps Local Events sync and refreshes approved waste connections', () => {
  const src = read('../app/api/cron/waste-sync/route.ts')
  const server = read('../app/lib/integrations/waste/server.ts')
  assert.match(src, /integrationActiveForPilot\('waste'\)\s*\? syncAllWasteUsers\(\)/)
  assert.match(src, /syncAllConnectedLocalEventsFrames\(\)/)
  assert.match(server, /supportedUsers\.map\(row => refreshWasteForUser\(row\.user_id\)\)/)
})

test('Waste items are visible in app and physical frame after connection is enabled', () => {
  const ui = read('../app/HomePageClient.tsx')
  const device = read('../app/api/device/reminders/route.ts')
  assert.match(ui, /source !== 'waste' \|\| integrationActiveForPilot\('waste'\)/)
  assert.match(ui, /String\(row\.provider \|\| ''\) !== 'waste' \|\| \(integrationActiveForPilot\('waste'\)/)
  assert.match(device, /if \(!integrationActiveForPilot\('waste'\) \|\| !providerEnabled\('waste'\)\) return/)
  assert.match(ui, /provider\.eq\.waste/)
  assert.match(ui, /String\(row\.raw\?\.collection_date \|\| row\.raw\?\.date \|\| ''\) >= todayYmd/)
  assert.match(ui, /nextAvailableSources = \['remind', 'teams', 'google-calendar', 'calendar-link', 'todoist', 'microsoft-todo', 'google-tasks', 'spond', 'local-events', 'waste', 'bonnetid'\]/)
})
