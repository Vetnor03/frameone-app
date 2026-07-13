import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildEdgeOfNorwayEventsUrl } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'
import { LOCAL_EVENT_PLACE_CATALOGUE, formatLocalEventPlaceList, normalizeLocalEventAreaPreference, searchLocalEventPlaces, suggestedLocalEventArea, uniqueLocalEventPlaceIds } from '../app/lib/integrations/local-events/places.ts'

const names = (query) => searchLocalEventPlaces(query).map((place) => place.displayName)

test('only allowed place options appear in search', () => {
  assert.deepEqual(names('stav'), ['Stavanger'])
  assert.equal(LOCAL_EVENT_PLACE_CATALOGUE.length, 5)
  assert.deepEqual(names('haugesund'), [])
})

test('attractions and broad regions do not appear', () => {
  const allNames = names('').join('\n')
  for (const blocked of ['Magma UNESCO Global Geopark', 'Norwegian Scenic Route Jæren', 'Preikestolen', 'Swords in rock', 'The Jæren beaches', 'Ryfylke Islands']) {
    assert.doesNotMatch(allNames, new RegExp(blocked, 'i'))
  }
})

test('search is case-insensitive and accent-insensitive', () => {
  assert.deepEqual(names('STAVANGER'), ['Stavanger'])
  assert.deepEqual(names('bry'), ['Bryne'])
  assert.deepEqual(names('algard'), [])
})

test('selecting Stavanger groups nearby smaller places under Stavanger', () => {
  assert.deepEqual(suggestedLocalEventArea('stavanger').includedPlaceIds, ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'])
})

test('selecting Sandnes groups nearby smaller places under Sandnes', () => {
  assert.deepEqual(suggestedLocalEventArea('sandnes').includedPlaceIds, ['sandnes', 'hommersak', 'forsand'])
})

test('primary place cannot be removed by normalization', () => {
  assert.deepEqual(normalizeLocalEventAreaPreference({ primaryPlaceId: 'stavanger', includedPlaceIds: [] })?.includedPlaceIds, ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'])
})

test('smaller places can be resolved for source URLs without appearing in UI options', () => {
  const withAdded = uniqueLocalEventPlaceIds([...suggestedLocalEventArea('stavanger').includedPlaceIds, 'kvitsoy'])
  assert.ok(withAdded.includes('kvitsoy'))
  assert.deepEqual(names('kvitsoy'), [])
})

test('duplicate places cannot be added', () => {
  assert.deepEqual(uniqueLocalEventPlaceIds(['stavanger', 'sola', 'sola', 'stavanger']), ['stavanger', 'sola'])
})

test('saved selection restores after reload', () => {
  const saved = JSON.stringify({ primaryPlaceId: 'sandnes', includedPlaceIds: ['sandnes'] })
  assert.deepEqual(normalizeLocalEventAreaPreference(JSON.parse(saved)), { primaryPlaceId: 'sandnes', includedPlaceIds: ['sandnes', 'hommersak', 'forsand'] })
})

test('repeated place query parameters use official source slugs', () => {
  const url = new URL(buildEdgeOfNorwayEventsUrl({ primaryPlaceId: 'stavanger', includedPlaceIds: ['rennesoy', 'kvitsoy'] }))
  assert.deepEqual(url.searchParams.getAll('place'), ['rennesoy-and-the-green-islands', 'kvitsoy'])
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
  assert.equal(formatLocalEventPlaceList(['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy']), 'Stavanger, Randaberg, Rennesøy, Finnøy and Kvitsøy')
})

test('normal Local Events UI hides diagnostics and developer area editing', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /Search for your place/)
  assert.doesNotMatch(home, /Selected place:|We also include nearby places that are close enough for spontaneous events\./)
  assert.doesNotMatch(home, /TEST LIVE EVENTS|Flight script counts|skipped counts|shadow-mode wording|Supabase wording/i)
  assert.doesNotMatch(home, /Included places|Add nearby|SAVE AREA/)
})

test('Local Events connect, status and disconnect API routes are frame scoped', () => {
  const connectRoute = readFileSync(new URL('../app/api/integrations/local-events/connect/route.ts', import.meta.url), 'utf8')
  const statusRoute = readFileSync(new URL('../app/api/integrations/local-events/status/route.ts', import.meta.url), 'utf8')
  const disconnectRoute = readFileSync(new URL('../app/api/integrations/local-events/disconnect/route.ts', import.meta.url), 'utf8')
  assert.match(connectRoute, /connectLocalEventsForFrame\(userId, deviceId/)
  assert.match(statusRoute, /requireLocalEventsFrameMember\(userId, deviceId, false\)/)
  assert.match(disconnectRoute, /disconnectLocalEventsForFrame\(userId, deviceId\)/)
})

test('accepted Edge of Norway events are persisted with stable external IDs and upserted', () => {
  const parser = readFileSync(new URL('../app/lib/integrations/local-events/edge-of-norway-shadow.ts', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.match(parser, /externalId: String\(eventObject\._id\)/)
  assert.match(server, /provider: EDGE_OF_NORWAY_PROVIDER/)
  assert.match(server, /upsert\(rows, \{ onConflict: 'device_id,provider,external_id' \}\)/)
  assert.match(server, /raw: \{[\s\S]*sourceUrl:[\s\S]*primaryPlaceId:[\s\S]*includedPlaceIds:/)
})

test('calendar imports Local Events as Events category without source URL action', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /'edge-of-norway'\) return 'local-events'/)
  assert.match(home, /if \(source === 'local-events'\) return 'event'/)
  assert.match(home, /if \(source === 'local-events'\) return 'Events'/)
  assert.doesNotMatch(home, /Open event page/)
})

test('calendar hides Local Events after they have been skipped for 24 hours', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /LOCAL_EVENT_CALENDAR_SKIP_HIDE_AFTER_MS = 24 \* 60 \* 60 \* 1000/)
  assert.match(home, /localEventSkipIsHiddenFromCalendar\(row\.updated_at\)/)
  assert.match(home, /localEventHiddenSkippedIds\.has\(externalEventId\)/)
  assert.match(home, /\.select\('external_event_id, skipped, updated_at'\)/)
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
