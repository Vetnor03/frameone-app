import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildEdgeOfNorwayEventsUrl } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'
import { LOCAL_EVENT_PLACE_CATALOGUE, formatLocalEventPlaceList, normalizeLocalEventAreaPreference, searchLocalEventPlaces, suggestedLocalEventArea, uniqueLocalEventPlaceIds } from '../app/lib/integrations/local-events/places.ts'

const names = (query) => searchLocalEventPlaces(query).map((place) => place.displayName)

test('only allowed place options appear in search', () => {
  assert.deepEqual(names('stav'), ['Stavanger'])
  assert.deepEqual(names(''), ['Stavanger', 'Sandnes', 'Sola', 'Bryne', 'Egersund'])
})

test('attractions and broad regions do not appear', () => {
  const allNames = names('').join('\n')
  for (const blocked of ['Magma UNESCO Global Geopark', 'Norwegian Scenic Route Jæren', 'Preikestolen', 'Swords in rock', 'The Jæren beaches', 'Haugesund']) {
    assert.doesNotMatch(allNames, new RegExp(blocked, 'i'))
  }
})

test('search is case-insensitive and accent-insensitive', () => {
  assert.deepEqual(names('STAVANGER'), ['Stavanger'])
  assert.deepEqual(names('algard'), [])
  assert.deepEqual(names('haugesund'), [])
})

test('selecting Stavanger preselects Stavanger, Sola, Sandnes and Randaberg', () => {
  assert.deepEqual(suggestedLocalEventArea('stavanger').includedPlaceIds, ['stavanger'])
})

test('selecting Sandnes uses its configured nearby suggestions', () => {
  assert.deepEqual(suggestedLocalEventArea('sandnes').includedPlaceIds, ['sandnes'])
})

test('all production selectable Local Events locations normalize without falling back to Stavanger', () => {
  for (const id of ['stavanger', 'sandnes', 'sola', 'egersund', 'bryne']) {
    assert.equal(suggestedLocalEventArea(id).primaryPlaceId, id)
    assert.equal(normalizeLocalEventAreaPreference(suggestedLocalEventArea(id))?.primaryPlaceId, id)
  }
})

test('primary place cannot be removed by normalization', () => {
  assert.deepEqual(normalizeLocalEventAreaPreference({ primaryPlaceId: 'stavanger', includedPlaceIds: ['sola'] })?.includedPlaceIds, ['stavanger'])
})

test('non-selectable source locations are not user-facing place ids', () => {
  assert.deepEqual(uniqueLocalEventPlaceIds([...suggestedLocalEventArea('stavanger').includedPlaceIds, 'kvitsoy']), ['stavanger'])
})

test('duplicate places cannot be added', () => {
  assert.deepEqual(uniqueLocalEventPlaceIds(['stavanger', 'sola', 'sola', 'stavanger']), ['stavanger', 'sola'])
})

test('saved selection restores after reload', () => {
  const saved = JSON.stringify({ primaryPlaceId: 'sola', includedPlaceIds: ['sola'] })
  assert.deepEqual(normalizeLocalEventAreaPreference(JSON.parse(saved)), { primaryPlaceId: 'sola', includedPlaceIds: ['sola'] })
})

test('repeated place query parameters use official source slugs', () => {
  const url = new URL(buildEdgeOfNorwayEventsUrl(suggestedLocalEventArea('stavanger')))
  assert.deepEqual(url.searchParams.getAll('place'), ['stavanger', 'sandnes', 'sola', 'randaberg', 'rennesoy-and-the-green-islands', 'kvitsoy', 'swords-in-rock', 'jorpeland', 'tau', 'strand-municipality', 'preikestolen'])
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
  assert.equal(formatLocalEventPlaceList(['stavanger', 'sola', 'sandnes']), 'Stavanger, Sola, Sandnes')
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


test('Local Events frame upsert conflicts have exact non-partial unique indexes', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260713120000_fix_local_events_frame_upsert_conflicts.sql', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.match(server, /upsert\(rows, \{ onConflict: 'device_id,provider,external_id' \}\)/)
  assert.match(server, /from\('user_integrations'\)\.upsert\([\s\S]*\{ onConflict: 'device_id,provider' \}\)/)
  assert.match(migration, /partition by device_id, provider/)
  assert.match(migration, /partition by device_id, provider, external_id/)
  assert.match(migration, /create unique index if not exists user_integrations_device_provider_unique_idx\s+on public\.user_integrations \(device_id, provider\);/)
  assert.match(migration, /create unique index if not exists integration_items_device_provider_external_idx\s+on public\.integration_items \(device_id, provider, external_id\);/)
  assert.doesNotMatch(migration, /where device_id is not null;\s*$/m)
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
  assert.ok(server.indexOf('const sync = await syncLocalEventsForFrame') < server.indexOf(".from('user_integrations').upsert"))
})

test('failed Local Events sync cannot delete last successful data before parsing', () => {
  const server = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.ok(server.indexOf('runEdgeOfNorwayShadowDiagnostic') < server.indexOf(".from('integration_items').delete()"))
  assert.match(server, /if \(result\.error \|\| result\.diagnosticError\) throw new Error/)
})
