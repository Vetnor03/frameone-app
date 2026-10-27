import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localEventVisibleForActiveFrame } from '../app/lib/integrations/local-events/visibility.ts'

const event = (device_id, areaKey = 'ssr:789065') => ({
  device_id, provider: 'edge-of-norway',
  raw: { areaKeys: [areaKey], areaKey },
})

test('Events belong to their selected frame even when the same account owns two', () => {
  const active = 'frm_801CCA76B144'
  assert.equal(localEventVisibleForActiveFrame(event(active), active, 'ssr:789065'), true)
  assert.equal(localEventVisibleForActiveFrame(event('frm_other'), active, 'ssr:789065'), false)
  assert.equal(localEventVisibleForActiveFrame(event(active), 'frm_other', 'ssr:789065'), false)
})

test('Events honor the selected area after frame scope is verified', () => {
  const active = 'frm_801CCA76B144'
  assert.equal(localEventVisibleForActiveFrame(event(active), active, 'ssr:another'), false)
  assert.equal(localEventVisibleForActiveFrame(event(active), active, ''), true)
  assert.equal(localEventVisibleForActiveFrame({ ...event(active), raw: { primaryPlaceId: 'ssr:789065' } }, active, 'ssr:789065'), true)
  assert.equal(localEventVisibleForActiveFrame({ ...event(active), raw: {} }, active, 'ssr:789065'), false)
})

test('Other account-wide integrations and their future events are unaffected', () => {
  assert.equal(localEventVisibleForActiveFrame({ provider: 'google-calendar', device_id: null }, 'frm_new', 'ssr:789065'), true)
  assert.equal(localEventVisibleForActiveFrame({ provider: 'teams', device_id: 'frm_other' }, 'frm_new', ''), true)
})

test('Local Events cannot be shown without an active frame', () => {
  assert.equal(localEventVisibleForActiveFrame(event('frm_old'), null, 'ssr:789065'), false)
})

test('app query fetches device ID and applies active-frame visibility before event skip UI', () => {
  const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(source, /\.select\('id, device_id, provider, external_id, title, starts_at, due_at, raw'\)/)
  assert.match(source, /localEventVisibleForActiveFrame\(row, activeDeviceId, selectedLocalEventArea\)/)
  assert.match(source, /skippedOnFrame: source === 'local-events'/)
})
