import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')

function localEventsBlock() {
  const start = route.indexOf("if (!providerEnabled('local-events')) return")
  const end = route.indexOf("logOptionalReminderProviderFailure('local-events'", start)
  return route.slice(start, end)
}

test('local events no longer build a giant external_event_id IN query', () => {
  const block = localEventsBlock()
  assert.doesNotMatch(block, /\.in\('external_event_id'/)
  assert.match(block, /\.eq\('device_id', device_id\)/)
  assert.match(block, /\.eq\('provider', 'edge-of-norway'\)/)
})

test('local event rows and skip rows are fetched in parallel', () => {
  const block = localEventsBlock()
  assert.match(block, /const \[eventsResult, skipsResult\] = await Promise\.all\(\[/)
})

test('selected local event area comes from already-loaded device settings', () => {
  const block = localEventsBlock()
  assert.match(block, /selectedIntegrations\['local-events'\]/)
  assert.doesNotMatch(block, /from\('user_integrations'\)/)
})

test('reminders logs core database timing', () => {
  assert.match(route, /shared_scope_ms: sharedScopeMs/)
  assert.match(route, /core_reads_ms: coreReadsMs/)
})
