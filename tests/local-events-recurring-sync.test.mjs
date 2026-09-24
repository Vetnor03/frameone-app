import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const server = await readFile(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
const cron = await readFile(new URL('../app/api/cron/waste-sync/route.ts', import.meta.url), 'utf8')

test('connected Local Events frames are refreshed on the daily integration sync', () => {
  assert.match(server, /export async function syncAllConnectedLocalEventsFrames/)
  assert.match(server, /\.eq\('provider', EDGE_OF_NORWAY_PROVIDER\)[\s\S]*\.eq\('status', 'connected'\)/)
  assert.match(server, /syncLocalEventsForFrame\(integration\.user_id, integration\.device_id, areaPreference, fetchImpl\)/)
  assert.match(server, /last_sync_at: now/)
  assert.match(cron, /syncAllConnectedLocalEventsFrames\(\)/)
  assert.match(cron, /Promise\.allSettled/)
})
