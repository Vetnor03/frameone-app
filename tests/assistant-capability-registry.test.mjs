import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ASSISTANT_CAPABILITIES, ASSISTANT_CAPABILITY_IDS } from '../app/lib/assistant/capabilities.ts'
import { ASSISTANT_CAPABILITY_HANDLERS, assertCapabilityRegistryIntegrity } from '../app/lib/assistant/handlers.ts'
import { ASSISTANT_DESTINATIONS } from '../app/lib/assistant/types.ts'
import { resolveDeterministicAssistantIntent, validateModelIntent } from '../app/lib/assistant/resolver.ts'

test('registry is the complete runtime control plane', () => {
  assert.equal(assertCapabilityRegistryIntegrity(), true)
  assert.equal(new Set(ASSISTANT_CAPABILITY_IDS).size, ASSISTANT_CAPABILITIES.length)
  for (const capability of ASSISTANT_CAPABILITIES) {
    const handler = ASSISTANT_CAPABILITY_HANDLERS[capability.id]
    assert.ok(handler.validate)
    assert.equal(typeof handler.run, 'function')
    assert.ok(['device_member', 'signed_in_user'].includes(handler.scope))
    assert.ok(['execute', 'read', 'navigate'].includes(handler.mode))
    assert.equal(typeof capability.destructive, 'boolean')
    assert.ok(capability.coverage)
    for (const key of capability.requiredArguments) {
      assert.ok(handler.missingQuestion[key] || ['text', 'items', 'theme', 'language', 'layout', 'rating'].includes(key))
    }
  }
})

test('core requests route to registered capability IDs', () => {
  const cases = [
    ['Bytt fotballag til Dortmund', 'football.set_team'],
    ['Hvilket fotballag følger jeg?', 'football.read'],
    ['Hvordan blir været i morgen?', 'weather.read'],
    ['Hva står på handlelisten?', 'groceries.read'],
    ['Lag nedtelling til ferie 10. september', 'countdown.create'],
    ['Bytt appen til dark mode', 'settings.set_app_theme'],
    ['Bytt språk til norsk', 'frame.set_language'],
    ['Bytt til layout 2', 'frame.set_layout'],
    ['Hellestø var dårlig i dag', 'surf.log_experience'],
  ]
  for (const [request, capabilityId] of cases) assert.equal(resolveDeterministicAssistantIntent(request)?.capabilityId, capabilityId, request)
  assert.equal(resolveDeterministicAssistantIntent('Hva er meningen med livet?'), null)
})

test('known incomplete operations retain capability-specific missing arguments', () => {
  const football = resolveDeterministicAssistantIntent('Bytt fotballag')
  assert.equal(football.capabilityId, 'football.set_team')
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS[football.capabilityId].missingQuestion.team.no, 'Hvilket fotballag vil du bruke?')
  const surf = resolveDeterministicAssistantIntent('Hellestø var dårlig i dag')
  assert.equal(surf.arguments.time, undefined)
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS[surf.capabilityId].missingQuestion.time.no, 'Når var du på surfespoten?')
})

test('model capability validation accepts registry IDs and rejects inventions', () => {
  assert.equal(validateModelIntent({ capabilityId: 'weather.read', arguments: { date: 'tomorrow' } })?.capabilityId, 'weather.read')
  assert.equal(validateModelIntent({ capabilityId: 'generic.chat', arguments: {} }), null)
})

test('model schema and navigation are derived and exhaustive', () => {
  const route = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(route, /enum: ASSISTANT_ROUTING_IDS/)
  assert.doesNotMatch(route, /enum: \['add_grocery_items'/)
  for (const destination of ASSISTANT_DESTINATIONS) assert.match(home, new RegExp(`case '${destination}'`))
  assert.match(home, /const exhaustive: never = destination/)
})
