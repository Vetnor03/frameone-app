import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildEdgeOfNorwayEventsUrl } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'
import { LOCAL_EVENT_PLACE_CATALOGUE, formatLocalEventPlaceList, normalizeLocalEventAreaPreference, searchLocalEventPlaces, suggestedLocalEventArea, uniqueLocalEventPlaceIds } from '../app/lib/integrations/local-events/places.ts'

const names = (query) => searchLocalEventPlaces(query).map((place) => place.displayName)

test('only allowed place options appear in search', () => {
  assert.deepEqual(names('stav'), ['Stavanger'])
  assert.equal(LOCAL_EVENT_PLACE_CATALOGUE.length, 20)
})

test('attractions and broad regions do not appear', () => {
  const allNames = names('').join('\n')
  for (const blocked of ['Magma UNESCO Global Geopark', 'Norwegian Scenic Route Jæren', 'Preikestolen', 'Swords in rock', 'The Jæren beaches', 'Ryfylke Islands']) {
    assert.doesNotMatch(allNames, new RegExp(blocked, 'i'))
  }
})

test('search is case-insensitive and accent-insensitive', () => {
  assert.deepEqual(names('STAVANGER'), ['Stavanger'])
  assert.deepEqual(names('algard'), ['Ålgård'])
})

test('selecting Stavanger preselects Stavanger, Sola, Sandnes and Randaberg', () => {
  assert.deepEqual(suggestedLocalEventArea('stavanger').includedPlaceIds, ['stavanger', 'sola', 'sandnes', 'randaberg'])
})

test('selecting Sandnes uses its configured nearby suggestions', () => {
  assert.deepEqual(suggestedLocalEventArea('sandnes').includedPlaceIds, ['sandnes', 'sola', 'stavanger', 'algard'])
})

test('primary place cannot be removed by normalization', () => {
  assert.deepEqual(normalizeLocalEventAreaPreference({ primaryPlaceId: 'stavanger', includedPlaceIds: ['sola'] })?.includedPlaceIds, ['stavanger', 'sola'])
})

test('nearby places can be added and removed', () => {
  const withAdded = uniqueLocalEventPlaceIds([...suggestedLocalEventArea('stavanger').includedPlaceIds, 'kvitsoy'])
  assert.ok(withAdded.includes('kvitsoy'))
  assert.deepEqual(withAdded.filter((id) => id !== 'sola'), ['stavanger', 'sandnes', 'randaberg', 'kvitsoy'])
})

test('duplicate places cannot be added', () => {
  assert.deepEqual(uniqueLocalEventPlaceIds(['stavanger', 'sola', 'sola', 'stavanger']), ['stavanger', 'sola'])
})

test('saved selection restores after reload', () => {
  const saved = JSON.stringify({ primaryPlaceId: 'sandnes', includedPlaceIds: ['sandnes', 'algard'] })
  assert.deepEqual(normalizeLocalEventAreaPreference(JSON.parse(saved)), { primaryPlaceId: 'sandnes', includedPlaceIds: ['sandnes', 'algard'] })
})

test('repeated place query parameters use official source slugs', () => {
  const url = new URL(buildEdgeOfNorwayEventsUrl({ primaryPlaceId: 'rennesoy', includedPlaceIds: ['rennesoy', 'strand'] }))
  assert.deepEqual(url.searchParams.getAll('place'), ['rennesoy-and-the-green-islands', 'strand-municipality'])
})

test('changing the selected area changes the diagnostic request URL', () => {
  assert.notEqual(buildEdgeOfNorwayEventsUrl(suggestedLocalEventArea('stavanger')), buildEdgeOfNorwayEventsUrl(suggestedLocalEventArea('sandnes')))
})

test('app/api/device/reminders/route.ts limits Local Events to the frame candidate builder', () => {
  const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  assert.match(route, /buildLocalEventFrameItem/)
  assert.match(route, /logOptionalReminderProviderFailure\('local-events'/)
})

test('format helper uses connected summary grammar', () => {
  assert.equal(formatLocalEventPlaceList(['stavanger', 'sola', 'sandnes', 'randaberg']), 'Stavanger, Sola, Sandnes and Randaberg')
})

test('normal Local Events UI hides diagnostics and developer area editing', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /Search for your place/)
  assert.doesNotMatch(home, /Selected place:|We also include nearby places that are close enough for spontaneous events\./)
  assert.doesNotMatch(home, /TEST LIVE EVENTS|Flight script counts|skipped counts|shadow-mode wording|Supabase wording/i)
  assert.doesNotMatch(home, /Included places|Add nearby|SAVE AREA/)
})

test('Local Events connect, status and disconnect API routes are user scoped', () => {
  const connectRoute = readFileSync(new URL('../app/api/integrations/local-events/connect/route.ts', import.meta.url), 'utf8')
  const disconnectRoute = readFileSync(new URL('../app/api/integrations/local-events/disconnect/route.ts', import.meta.url), 'utf8')
  assert.match(connectRoute, /connectLocalEventsForUser\(userId/)
  assert.match(disconnectRoute, /disconnectLocalEventsForUser\(userId\)/)
})

test('accepted Edge of Norway events are persisted with stable external IDs and upserted', () => {
  const parser = readFileSync(new URL('../app/lib/integrations/local-events/edge-of-norway-shadow.ts', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.match(parser, /externalId: String\(eventObject\._id\)/)
  assert.match(server, /provider: EDGE_OF_NORWAY_PROVIDER/)
  assert.match(server, /upsert\(rows, \{ onConflict: 'user_id,provider,external_id' \}\)/)
  assert.match(server, /raw: \{[\s\S]*sourceUrl:[\s\S]*primaryPlaceId:[\s\S]*includedPlaceIds:/)
})

test('calendar imports Local Events as Events category with source URL action', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /'edge-of-norway'\) return 'local-events'/)
  assert.match(home, /if \(source === 'local-events'\) return 'event'/)
  assert.match(home, /if \(source === 'local-events'\) return 'Events'/)
  assert.match(home, /Open event page/)
})

test('Local Events frame feed is limited and mirror stays decoupled', () => {
  const deviceRoute = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
  assert.match(deviceRoute, /buildLocalEventFrameItem/)
  assert.match(deviceRoute, /logOptionalReminderProviderFailure\('local-events'/)
  assert.doesNotMatch(mirrorRoute, /edge-of-norway|Local Events/i)
})

test('connect marks Local Events connected only after sync succeeds', () => {
  const server = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.ok(server.indexOf('const sync = await syncLocalEventsForUser') < server.indexOf(".from('user_integrations').upsert"))
})

test('failed Local Events sync cannot delete last successful data before parsing', () => {
  const server = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.ok(server.indexOf('runEdgeOfNorwayShadowDiagnostic') < server.indexOf(".from('integration_items').delete()"))
  assert.match(server, /if \(result\.error \|\| result\.diagnosticError\) throw new Error/)
})
