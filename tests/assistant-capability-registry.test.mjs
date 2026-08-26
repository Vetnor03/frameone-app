import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ASSISTANT_CAPABILITIES } from '../app/lib/assistant/capabilities.ts'
import { resolveDeterministicAssistantIntent, validateModelIntent } from '../app/lib/assistant/resolver.ts'

test('the assistant registry inventories every current app domain', () => {
  const domains = new Set(ASSISTANT_CAPABILITIES.map((capability) => capability.domain))
  for (const domain of ['frame', 'reminders', 'groceries', 'recipes', 'surf', 'weather', 'countdown', 'date', 'football', 'stocks', 'ai_follow', 'settings']) {
    assert.ok(domains.has(domain), `missing ${domain}`)
  }
  for (const capability of ASSISTANT_CAPABILITIES) {
    assert.ok(capability.id && capability.operation && capability.kind)
    assert.ok(Array.isArray(capability.aliases) && capability.aliases.length)
    assert.ok(Array.isArray(capability.requiredArguments))
  }
})

test('football team changes resolve from the canonical UI catalogue', () => {
  assert.deepEqual(resolveDeterministicAssistantIntent('Bytt fotballag til Dortmund'), {
    action: 'set_football_team',
    arguments: { teamId: 'dortmund', teamName: 'Borussia Dortmund', competitionId: 'BL', competitionName: 'Bundesliga' },
  })
  assert.equal(resolveDeterministicAssistantIntent('Bytt fotballag til Atlantis'), null)
  assert.equal(validateModelIntent({ action: 'set_football_team', arguments: { team: 'Dortmund' } })?.action, 'set_football_team')
})

test('football execution preserves settings and uses the canonical settings RPC', () => {
  const handlers = readFileSync(new URL('../app/lib/assistant/handlers.ts', import.meta.url), 'utf8')
  assert.match(handlers, /from\('device_settings'\)\.select\('settings_json'\)/)
  assert.match(handlers, /rpc\('upsert_device_settings'/)
  assert.match(handlers, /Fotballaget er byttet til/)
})

test('AI schema and execution are registry-derived capability requests', () => {
  const route = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
  assert.match(route, /enum: \[\.\.\.ASSISTANT_CAPABILITY_IDS, 'unsupported'\]/)
  assert.match(route, /resolveDeterministicCapabilityRequest\(body\.text\)/)
  assert.match(route, /executeCapabilityRequest\(capability, capabilityContext/)
  assert.doesNotMatch(route, /enum: \['add_grocery_items'/)
})
