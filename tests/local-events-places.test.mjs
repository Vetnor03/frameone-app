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

test('app/api/device/reminders/route.ts remains untouched by Local Events', () => {
  const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(route, /local[-_ ]?events|Local Events|localEvents/i)
})

test('format helper uses connected summary grammar', () => {
  assert.equal(formatLocalEventPlaceList(['stavanger', 'sola', 'sandnes', 'randaberg']), 'Stavanger, Sola, Sandnes and Randaberg')
})
