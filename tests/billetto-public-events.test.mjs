import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAdditionalEvents, parseSourceJson } from '../app/lib/integrations/local-events/extra-sources.ts'

const area = { primaryPlaceId: 'ssr:1', includedPlaceIds: ['ssr:1'], placeLabel: 'Stavanger', latitude: 58.969, longitude: 5.733, radiusKm: 25 }

function example({ id = '001', state = 'published', country = 'NO', latitude = 58.970, longitude = 5.732, startdate = '2027-01-20T18:00:00Z' } = {}) {
  return {
    id, object: 'public_event', state,
    title: 'Billetto local concert',
    url: 'https://billetto.no/e/billetter-001?utm_source=Billetto+Advertising&utm_medium=Publisher&utm_campaign=External+Partner&utm_content=NO+1337',
    location: {
      location_name: 'Stavanger konserthus',
      city: 'Stavanger',
      country_code: country,
      coordinates: { latitude, longitude },
    },
    startdate,
    enddate: '2027-01-20T20:00:00Z',
  }
}

test('documented Billetto public events object normalizes Norwegian event time, venue and UTM ticket link', () => {
  const events = parseSourceJson('billetto', { object: 'list', data: [example()] }, area)
  assert.equal(events.length, 1)
  const e = events[0]
  assert.equal(e.source, 'billetto')
  assert.equal(e.externalId, 'billetto:001')
  assert.equal(e.date, '2027-01-20')
  assert.equal(e.startTime, '19:00')
  assert.equal(e.venue, 'Stavanger konserthus')
  assert.equal(e.sourceUrl.includes('utm_campaign=External+Partner'), true)
  assert.equal(e.sourceLinks?.[0]?.url, e.sourceUrl)
})

test('Billetto filters other countries, cancelled, historical and out-of-radius events', () => {
  const list = [
    example({ id: 'dk', country: 'DK' }),
    example({ id: 'cancelled', state: 'canceled' }),
    example({ id: 'historical', startdate: '2024-01-20T18:00:00Z' }),
    example({ id: 'oslo', latitude: 59.9, longitude: 10.7 }),
    example({ id: 'ok' }),
  ]
  const events = parseSourceJson('billetto', { object: 'list', data: list }, area)
  assert.deepEqual(events.map(e => e.externalId), ['billetto:ok'])
})

test('Billetto keypair header activates only Billetto source with documented max-100 path', async () => {
  const calls = []
  const result = await fetchAdditionalEvents(area, async (url, options) => {
    calls.push({ url, headers: options.headers })
    return new Response(JSON.stringify({ object: 'list', data: [example()] }), { status: 200 })
  }, { BILLETTO_API_KEYPAIR: 'fake-opaque-testing-keypair' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers['Api-Keypair'], 'fake-opaque-testing-keypair')
  assert.equal(new URL(calls[0].url).pathname, '/api/v3/public/events')
  assert.equal(new URL(calls[0].url).searchParams.get('limit'), '100')
  assert.deepEqual(result.events.map(e => e.source), ['billetto'])
  assert.equal(result.states.billetto, 'ok')
  assert.equal(result.states.friskus, 'not_configured')
})

test('Bad Billetto feed fails independently, without misleadingly counting the source active', async () => {
  const result = await fetchAdditionalEvents(area, async () => new Response('401', { status: 401 }), { BILLETTO_API_KEYPAIR: 'fake-opaque-testing-keypair' })
  assert.equal(result.states.billetto, 'failed')
  assert.deepEqual(result.events, [])
})

test('Norwegian Billetto domain can be overridden only with allowlisted HTTPS provider hosts', async () => {
  await assert.rejects(() => fetchAdditionalEvents(area, fetch, {
    BILLETTO_API_KEYPAIR: 'fake-opaque-testing-keypair',
    BILLETTO_PUBLIC_EVENTS_URL: 'https://evil.example/api/v3/public/events',
  }), /does not belong to billetto/)
})
