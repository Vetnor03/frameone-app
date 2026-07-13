import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLinTicketPayload, runLinTicketDiagnostic } from '../app/lib/integrations/local-events/linticket.ts'
import { searchLocalEventPlaces } from '../app/lib/integrations/local-events/places.ts'
import { buildLocalEventFrameItem } from '../app/lib/device/remindersFeed.ts'

const sample = {
  events: [{
    id: 'evt-1', occurrence_id: 'occ-1', title: 'Sommerkonsert', description: 'Musikk', start_time: '2026-08-01T18:00:00+02:00', end_time: '2026-08-01T20:00:00+02:00',
    venue: 'Haugesund Kulturhus', address: 'Strandgata 1', city: 'Haugesund', municipality: 'Haugesund', county: 'Rogaland', country: 'NO', latitude: 59.4138, longitude: 5.268, category: 'Concert', organizer: 'Arrangør', age_limit: '18', price: '100', ticket_status: 'available', url: 'https://example.test/e', image: 'https://example.test/i.jpg'
  }]
}

test('parses and normalizes a representative LinTicket response', () => {
  const result = parseLinTicketPayload(sample)
  assert.equal(result.eventObjectsFound, 1)
  assert.equal(result.events.length, 1)
  const event = result.events[0]
  assert.equal(event.provider, 'linticket')
  assert.equal(event.sourceEventId, 'evt-1')
  assert.equal(event.occurrenceId, 'occ-1')
  assert.equal(event.title, 'Sommerkonsert')
  assert.equal(event.venue, 'Haugesund Kulturhus')
  assert.equal(event.address, 'Strandgata 1')
  assert.equal(event.location?.id, 'haugesund')
  assert.equal(event.canonicalEventId, 'linticket:evt-1:2026-08-01T16:00:00.000Z')
})

test('malformed LinTicket response is rejected', () => {
  assert.throws(() => parseLinTicketPayload({ nope: true }), /events array/)
})

test('LinTicket empty response is valid and independent', () => {
  const result = parseLinTicketPayload({ events: [] })
  assert.equal(result.events.length, 0)
})

test('LinTicket network failure returns provider diagnostic instead of throwing', async () => {
  const result = await runLinTicketDiagnostic(async () => { throw new Error('network down') })
  assert.equal(result.ok, false)
  assert.equal(result.acceptedEvents.length, 0)
  assert.match(result.error, /network down/)
})

test('LinTicket-only location becomes searchable without venue becoming a city', () => {
  parseLinTicketPayload(sample)
  assert.deepEqual(searchLocalEventPlaces('haugesund').map((place) => place.displayName), ['Haugesund'])
  assert.deepEqual(searchLocalEventPlaces('kulturhus').map((place) => place.displayName), [])
})

test('one local event appears on frame across all local-event providers and skip is canonical', () => {
  const rows = [
    { provider: 'edge-of-norway', external_id: 'edge-1', title: 'Later', starts_at: '2026-08-01T20:00:00.000Z', due_at: null, raw: { canonicalEventId: 'local-events:edge-1', date: '2026-08-01' } },
    { provider: 'linticket', external_id: 'linticket:evt-1:2026-08-01T16:00:00.000Z', title: 'Sommerkonsert', starts_at: '2026-08-01T16:00:00.000Z', due_at: null, raw: { canonicalEventId: 'linticket:evt-1:2026-08-01T16:00:00.000Z', date: '2026-08-01' } },
  ]
  const selected = buildLocalEventFrameItem(rows, [], '2026-07-31', new Date('2026-07-31T12:00:00.000Z'))
  assert.equal(selected.length, 1)
  assert.equal(selected[0].external_id, 'linticket:evt-1:2026-08-01T16:00:00.000Z')
  const skipped = buildLocalEventFrameItem(rows, [{ provider: 'local-events', external_event_id: 'linticket:evt-1:2026-08-01T16:00:00.000Z', skipped: true }], '2026-07-31', new Date('2026-07-31T12:00:00.000Z'))
  assert.equal(skipped[0].title, 'Later')
})
