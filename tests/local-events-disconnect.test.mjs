import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const localEventsServer = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
const disconnectServer = readFileSync(new URL('../app/lib/integrations/disconnect.ts', import.meta.url), 'utf8')

test('local events disconnect deletes cached reminder events and prevents automatic resync', () => {
  assert.match(disconnectServer, /\.from\('integration_items'\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\('provider', provider\)/)
  assert.match(localEventsServer, /if \(!opts\.force\) \{[\s\S]*?\.from\('user_integrations'\)[\s\S]*?\.eq\('provider', LOCAL_EVENTS_PROVIDER\)[\s\S]*?integration\.status !== 'connected'[\s\S]*?synced: false/)
})
