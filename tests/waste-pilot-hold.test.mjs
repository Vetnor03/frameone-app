import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { integrationActiveForPilot, INTEGRATION_CATALOGUE } from '../app/lib/integrations/catalog.ts'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Renovasjon is connectable as an experimental six-address pilot integration', () => {
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

test('Connect offers a waste address dialog, EDIT button and keeps evaluation-only cards gated', () => {
  const ui = read('../app/HomePageClient.tsx')
  assert.match(ui, /INTEGRATION_CATALOGUE\.filter\(definition => !startup \|\| \(definition\.connectable/)
  assert.match(ui, /!app\.connectable \? \(/)
  assert.match(ui, /app\.key === 'waste' \? \(/)
  assert.match(ui, /setWasteModalOpen\(true\)/)
  assert.match(ui, /WasteSetupModal language=\{language\}/)
  const modal = read('../app/components/WasteSetupModal.tsx')
  assert.match(modal, /\/api\/integrations\/waste\/search/)
  assert.match(modal, /results\.map\(a => <button/)
  assert.match(modal, /\/api\/integrations\/waste\/connect/)
  assert.match(modal, /\/api\/integrations\/waste\/disconnect/)
})

test('Authenticated connect API retains a catalog gate, the server verifies manual address ID', () => {
  const route = read('../app/api/integrations/waste/connect/route.ts')
  const server = read('../app/lib/integrations/waste/server.ts')
  assert.match(route, /getAuthenticatedUserId\(req\)/)
  assert.match(route, /if \(!integrationActiveForPilot\('waste'\)\)/)
  assert.match(server, /resolvePilotWasteAddress\(address\)/)
  assert.match(server, /family: 'pilot_manual'/)
  assert.match(server, /searchPilotWasteAddresses\(query\)/)
  assert.doesNotMatch(server, /searchKartverketAddresses/)
})

test('Cron keeps existing Local Events sync and only refreshes verified manual waste connections', () => {
  const src = read('../app/api/cron/waste-sync/route.ts')
  const server = read('../app/lib/integrations/waste/server.ts')
  assert.match(src, /integrationActiveForPilot\('waste'\)\s*\? syncAllWasteUsers\(\)/)
  assert.match(src, /syncAllConnectedLocalEventsFrames\(\)/)
  assert.match(server, /manualUsers\.map\(row => refreshWasteForUser\(row\.user_id\)\)/)
})

test('Waste items are visible in app and physical frame after connection is enabled', () => {
  const ui = read('../app/HomePageClient.tsx')
  const device = read('../app/api/device/reminders/route.ts')
  assert.match(ui, /source !== 'waste' \|\| integrationActiveForPilot\('waste'\)/)
  assert.match(ui, /String\(row\.provider \|\| ''\) !== 'waste' \|\| integrationActiveForPilot\('waste'\)/)
  assert.match(device, /if \(!integrationActiveForPilot\('waste'\) \|\| !providerEnabled\('waste'\)\) return/)
})
