import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAdditionalEvents, parseFriskusRss, parseSourceJson, validateProviderUrl, eventLocalDateTime } from '../app/lib/integrations/local-events/extra-sources.ts'

const stavanger = { primaryPlaceId: 'ssr:1', includedPlaceIds: ['ssr:1'], placeLabel: 'Stavanger', latitude: 58.969, longitude: 5.733, radiusKm: 25 }
const localEvent = {
  id: 'concert-1', title: 'Konsert', startDate: '2026-11-07T19:30:00',
  url: 'https://tikkio.com/tickets/konsert', venue: { name: 'Konserthus', location: { latitude: 58.970, longitude: 5.732 } },
}
test('extra source URLs are HTTPS and restricted to approved provider hosts', () => {
  assert.equal(validateProviderUrl('tikkio', 'https://api.tikkio.com/v1/events'), 'https://api.tikkio.com/v1/events')
  assert.throws(() => validateProviderUrl('tikkio', 'https://evil.test/?next=tikkio.com'))
  assert.throws(() => validateProviderUrl('friskus', 'http://friskus.com/rss'))
  assert.throws(() => validateProviderUrl('billetto', 'https://billetto.com.evil.test/api'))
})

test('JSON feeds normalise ticket info and exclude distant activities', () => {
  const rows = parseSourceJson('tikkio', { events: [localEvent, { ...localEvent, id: 'far', venue: { location: { latitude: 59.91, longitude: 10.75 } } }] }, stavanger)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].source, 'tikkio')
  assert.equal(rows[0].sourceUrl, localEvent.url)
  assert.equal(rows[0].startTime, '19:30')
  assert.equal(rows[0].externalId, 'tikkio:concert-1')
  assert.throws(() => parseSourceJson('tikkio', { greeting: true }, stavanger), /Unrecognized/)
})

test('ISO timestamp with timezone is converted to Norwegian event time', () => {
  assert.deepEqual(eventLocalDateTime('2026-11-07T18:00:00Z'), { date: '2026-11-07', time: '19:00' })
  assert.deepEqual(eventLocalDateTime('2026-07-07T18:00:00Z'), { date: '2026-07-07', time: '20:00' })
})

test('Friskus RSS requires a genuine activity date, never RSS publication date', () => {
  const xml = '<?xml version="1.0"?><rss version="2.0"><channel>' +
    '<item><title>Activity &amp; family</title><link>https://friskus.com/activity/12</link>' +
    '<pubDate>Sat, 10 Oct 2026 19:00:00 GMT</pubDate><event:startDate>2026-11-07T12:00:00</event:startDate></item>' +
    '<item><title>Published only</title><link>https://friskus.com/activity/13</link>' +
    '<pubDate>Sat, 10 Oct 2026 19:00:00 GMT</pubDate></item></channel></rss>'
  const rows = parseFriskusRss(xml, stavanger, { latitude: 58.969, longitude: 5.733 })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, 'Activity & family')
  assert.equal(rows[0].date, '2026-11-07')
  assert.throws(() => parseFriskusRss('<html>not a feed</html>', stavanger), /RSS/)
})

test('one vendor failing does not stop other vendors', async () => {
  const env = {
    TIKKIO_DISCOVERY_FEED_URL: 'https://api.tikkio.com/v1/discovery',
    BILLETTO_PUBLIC_EVENTS_URL: 'https://api.billetto.com/v3/public-events',
    FRISKUS_RSS_FEEDS_JSON: JSON.stringify([{ url: 'https://friskus.com/activities/rss', latitude: 58.969, longitude: 5.733 }]),
    TICKETCO_EVENTS_FEED_URL: 'https://api.ticketco.events/events',
  }
  const requests = []
  const fetchImpl = async (url) => {
    requests.push(url)
    if (url.includes('billetto')) return new Response('unavailable', { status: 500 })
    if (url.includes('friskus')) return new Response('<rss><channel><item><title>Local walk</title><link>https://friskus.com/e/1</link><startDate>2026-11-08</startDate></item></channel></rss>', { status: 200 })
    return new Response(JSON.stringify({ events: [localEvent] }), { status: 200 })
  }
  const result = await fetchAdditionalEvents(stavanger, fetchImpl, env)
  assert.equal(requests.length, 4)
  assert.equal(result.states.billetto, 'failed')
  assert.equal(result.states.friskus, 'ok')
  assert.equal(result.states.ticketco, 'ok')
  assert.equal(result.states.tikkio, 'ok')
  assert.equal(result.events.length, 3)
})

test('no feed configured makes zero external requests and reports no extra source as active', async () => {
  const result = await fetchAdditionalEvents(stavanger, async () => { throw Error('no fetch expected') }, {})
  assert.ok(Object.values(result.states).every(x => x === 'not_configured'))
  assert.equal(result.events.length, 0)
})
