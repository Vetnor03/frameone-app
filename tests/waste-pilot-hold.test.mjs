import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { integrationActiveForPilot, INTEGRATION_CATALOGUE } from '../app/lib/integrations/catalog.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Waste Collection is nonconnectable and Under evaluation for the first pilot', () => {
  const waste = INTEGRATION_CATALOGUE.find(app => app.key === 'waste')
  assert.equal(waste.status, 'under-evaluation')
  assert.equal(waste.connectable, false)
  assert.equal(integrationActiveForPilot('waste'), false)
  for (const key of ['teams', 'google-calendar', 'local-events', 'spond']) {
    assert.equal(integrationActiveForPilot(key), true, key + ' stays active')
  }
})

test('Connect shows evaluation status and provides no connect button or onboarding option', () => {
  const ui = read('../app/HomePageClient.tsx')
  assert.match(ui, /INTEGRATION_CATALOGUE\.filter\(definition => !startup \|\| \(definition\.connectable/)
  assert.match(ui, /!app\.connectable \? \(/)
  assert.match(ui, /integrationStatusLabel\(app\.status, language\)/)
  assert.match(ui, /if \(!app\.connectable\) return false/)
})

test('Direct waste connect API rejects activation even if called outside Connect', () => {
  const src = read('../app/api/integrations/waste/connect/route.ts')
  assert.match(src, /if \(!integrationActiveForPilot\('waste'\)\)/)
  assert.match(src, /under evaluation and unavailable during the first pilot/)
})

test('Waste scheduled sync is on hold without stopping Local Events cron', () => {
  const src = read('../app/api/cron/waste-sync/route.ts')
  assert.match(src, /integrationActiveForPilot\('waste'\)\s*\? syncAllWasteUsers\(\)/)
  assert.match(src, /syncAllConnectedLocalEventsFrames\(\)/)
})

test('Previously cached waste entries do not appear in app or on physical frame', () => {
  const ui = read('../app/HomePageClient.tsx')
  const device = read('../app/api/device/reminders/route.ts')
  assert.match(ui, /source !== 'waste' \|\| integrationActiveForPilot\('waste'\)/)
  assert.match(ui, /String\(row\.provider \|\| ''\) !== 'waste' \|\| integrationActiveForPilot\('waste'\)/)
  assert.match(device, /if \(!integrationActiveForPilot\('waste'\) \|\| !providerEnabled\('waste'\)\) return/)
})
