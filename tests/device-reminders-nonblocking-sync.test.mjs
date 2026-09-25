import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')

test('physical reminders never block the response on Spond or Teams refresh', () => {
  const start = route.indexOf('if (!skipSync) {')
  const end = route.indexOf('await Promise.all([', start)
  const block = route.slice(start, end)
  const afterStart = block.indexOf('after(async () => {')
  const prefix = block.slice(0, afterStart)
  assert.ok(afterStart >= 0)
  assert.match(block, /syncSpondIfStaleForUsers/)
  assert.match(block, /syncTeamsIfStaleForUser/)
  assert.doesNotMatch(prefix, /await Promise\.allSettled/)
})

test('reminders response logs end-to-end latency and whether upstream sync was deferred', () => {
  assert.match(route, /total_ms: Date\.now\(\) - requestStartedAt/)
  assert.match(route, /upstream_sync: skipSync \? 'skipped' : 'deferred'/)
})
