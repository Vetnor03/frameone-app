import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ASSISTANT_CAPABILITIES } from '../app/lib/assistant/capabilities.ts'
import { ASSISTANT_DESTINATIONS } from '../app/lib/assistant/types.ts'

const route = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('model schema derives capability IDs and API dispatches one generic request', () => {
  assert.match(route, /enum: \[\.\.\.ASSISTANT_CAPABILITY_IDS, 'unsupported'\]/)
  assert.doesNotMatch(route, /enum: \['add_grocery_items'/)
  assert.match(route, /resolveDeterministicCapabilityRequest/)
  assert.match(route, /executeCapabilityRequest\(db, admin, user, requestDeviceId, capability/)
  for (const id of ['football.set_team', 'football.read', 'groceries.add', 'groceries.read', 'reminders.create', 'reminders.read', 'surf.log_experience', 'surf.read', 'weather.read', 'countdown.create', 'settings.set_app_theme', 'frame.set_language', 'frame.set_layout']) {
    assert.ok(ASSISTANT_CAPABILITIES.some((capability) => capability.id === id), id)
  }
})

test('Assistant navigation exhaustively maps every declared destination', () => {
  const block = home.slice(home.indexOf('function navigateFromAssistant'), home.indexOf('const isPlainFrameAssistantSurface'))
  for (const destination of ASSISTANT_DESTINATIONS) assert.match(block, new RegExp(`case '${destination}'`), destination)
  assert.match(block, /const exhaustive: never = destination/)
  assert.doesNotMatch(block, /else \{ setActiveTab\('reminders'\)/)
})

test('registry contains no silent navigation fallback for advertised writes', () => {
  const handlers = readFileSync(new URL('../app/lib/assistant/handlers.ts', import.meta.url), 'utf8')
  assert.match(handlers, /if \(capability\.kind !== 'navigation'\) throw new Error/)
})
