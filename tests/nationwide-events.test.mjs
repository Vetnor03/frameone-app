import assert from 'node:assert/strict'
import test from 'node:test'
import { distanceKm, encodeGeoHash, deduplicateEvents, fetchNationwideEvents, parseTicketmasterEvents, PLANNED_EVENT_SOURCES, upstreamRetryDeferred } from '../app/lib/integrations/local-events/nationwide.ts'
import { normalizeLocalEventAreaPreference, nationwideLocalEventArea } from '../app/lib/integrations/local-events/places.ts'

const stavanger = nationwideLocalEventArea({ id: 'ssr:1234', label: 'Stavanger, Stavanger', latitude: 58.969, longitude: 5.733 }, 25)

test('all-Norway place preference is normalized and distance range is constrained', () => {
  assert.deepEqual(normalizeLocalEventAreaPreference(stavanger), stavanger)
  assert.equal(normalizeLocalEventAreaPreference({ ...stavanger, radiusKm: 900 })?.radiusKm, 25)
  assert.equal(normalizeLocalEventAreaPreference({ ...stavanger, latitude: 100 }), null)
  assert.equal(normalizeLocalEventAreaPreference({ ...stavanger, primaryPlaceId: 'https://evil.test' }), null)
})

test('geo hash is deterministic; nearby radius is in kilometers', () => {
  assert.equal(encodeGeoHash(58.969, 5.733).length, 7)
  assert.equal(encodeGeoHash(58.969, 5.733), encodeGeoHash(58.969, 5.733))
  assert.equal(distanceKm(58.969, 5.733, 58.969, 5.733), 0)
  assert.ok(distanceKm(58.969, 5.733, 59.91, 10.75) > 200)
})

const event = (id, name, latitude, longitude) => ({
  id, name, url: 'https://www.ticketmaster.no/event/' + id,
  dates: { start: { localDate: '2026-11-07', localTime: '18:30:00' } },
  _embedded: { venues: [{ name: 'Venue', location: { latitude: String(latitude), longitude: String(longitude) } }] },
})

test('Ticketmaster parser includes nearby tickets and excludes distant events', () => {
  const rows = parseTicketmasterEvents({ _embedded: { events: [event('one', 'Concert', 58.97, 5.73), event('two', 'Far away', 59.91, 10.75)] } }, 58.969, 5.733, 25)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].source, 'ticketmaster')
  assert.equal(rows[0].startTime, '18:30')
  assert.match(rows[0].sourceUrl, /^https:\/\//)
})

test('duplicate ticket sources collapse into one event', () => {
  const row = parseTicketmasterEvents({ _embedded: { events: [event('one', 'Concert', 58.97, 5.73)] } }, 58.969, 5.733, 25)[0]
  assert.equal(deduplicateEvents([row, { ...row, source: 'billetto', externalId: 'billetto:42' }]).length, 1)
  assert.deepEqual(PLANNED_EVENT_SOURCES, ['ticketmaster', 'tikkio', 'billetto', 'friskus', 'ticketco'])
})

test('source adapter requires API key; never scrapes the Edge of Norway website', async () => {
  await assert.rejects(fetchNationwideEvents(stavanger, fetch, ''), /API key/)
  const urls = []
  const mockedFetch = async (url) => {
    urls.push(new URL(url))
    return new Response(JSON.stringify({ _embedded: { events: [event('one', 'Concert', 58.97, 5.73)] }, page: { totalPages: 1 } }), { status: 200 })
  }
  const result = await fetchNationwideEvents(stavanger, mockedFetch, 'test-api-key')
  assert.equal(result.acceptedEvents.length, 1)
  assert.equal(urls.length, 1)
  assert.equal(urls[0].searchParams.get('countryCode'), 'NO')
  assert.equal(urls[0].searchParams.get('radius'), '25')
  assert.equal(urls[0].searchParams.get('unit'), 'km')
  assert.ok(urls[0].searchParams.get('geoPoint'))
  assert.ok(!urls[0].toString().includes('edgeofnorway.com'))
})

test('429 source throttling defers repeated calls but expires after six hours', () => {
  const now = Date.parse('2026-10-10T10:00:00.000Z')
  assert.equal(upstreamRetryDeferred('Ticketmaster returned HTTP 429', '2026-10-10T09:00:00.000Z', now), true)
  assert.equal(upstreamRetryDeferred('Ticketmaster returned HTTP 429', '2026-10-10T01:00:00.000Z', now), false)
  assert.equal(upstreamRetryDeferred('Ticketmaster returned HTTP 500', '2026-10-10T09:00:00.000Z', now), false)
  assert.equal(upstreamRetryDeferred('Edge of Norway returned 429', '2026-10-10T09:00:00.000Z', now), false)
  assert.equal(upstreamRetryDeferred(null, null, now), false)
})
