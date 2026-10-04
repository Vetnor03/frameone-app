import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const server = await readFile(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
const route = await readFile(new URL('../app/api/integrations/local-events/connect/route.ts', import.meta.url), 'utf8')
const home = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const cron = await readFile(new URL('../app/api/cron/waste-sync/route.ts', import.meta.url), 'utf8')

test('Local Events stays connected when the upstream refresh is temporarily unavailable', () => {
  const start = server.indexOf('export async function connectLocalEventsForFrame')
  const end = server.indexOf('export async function syncAllConnectedLocalEventsFrames', start)
  assert.ok(start >= 0 && end > start)
  const connect = server.slice(start, end)

  const persistConnection = connect.indexOf(".from('user_integrations').upsert")
  const initialSync = connect.indexOf('syncLocalEventsForFrame(')
  assert.ok(persistConnection >= 0)
  assert.ok(initialSync > persistConnection, 'connection must be persisted before the source refresh starts')
  assert.match(connect, /syncPending: true/)
  assert.match(connect, /last_error: message/)
  assert.match(connect, /last_error_at: failedAt/)
  assert.match(server, /429\|rate\.\?limit\|too many requests/)
})

test('connect API and app surface the pending automatic retry state', () => {
  assert.match(route, /syncPending: result\.syncPending/)
  assert.match(route, /syncError: result\.syncError/)
  assert.match(home, /if \(json\?\.syncPending\)/)
  assert.match(home, /Refresh will retry automatically/)
})

test('daily integration cron reports missing CRON_SECRET as configuration failure', () => {
  assert.match(cron, /if \(!secret\)/)
  assert.match(cron, /Cron not configured/)
  assert.match(cron, /status: 503/)
})
