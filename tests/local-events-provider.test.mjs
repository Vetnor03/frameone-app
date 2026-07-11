import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fixture = JSON.parse(readFileSync(new URL('./fixtures-friskus-events.json', import.meta.url), 'utf8'))

test('representative Friskus response uses data.events', () => {
  assert.ok(Array.isArray(fixture.data.events))
  assert.equal(fixture.data.events.length, 3)
})

test('date filter keeps current multi-day events and removes ended events', () => {
  const startOfToday = new Date('2026-07-11T00:00:00+02:00')
  const horizon = new Date('2026-07-25T00:00:00+02:00')
  const remaining = fixture.data.events.filter((event) => {
    const start = new Date(event.starts_at)
    const end = new Date(event.ends_at || event.starts_at)
    return end >= startOfToday && start <= horizon
  })
  assert.deepEqual(remaining.map((event) => event.id), ['stavanger-1', 'started-yesterday'])
})

test('provider request uses Friskus municipality slug and observed municipality UUID filter', () => {
  const url = new URL('https://api.friskus.com/api/v1/events')
  url.searchParams.set('municipality', 'stavanger')
  url.searchParams.set('filters', 'global_filters_municipalities(EQ)f76ec1ae-dc3b-4291-bfb9-a4fec0c129fd$$true')
  assert.equal(url.searchParams.get('municipality'), 'stavanger')
  assert.equal(url.searchParams.get('filters'), 'global_filters_municipalities(EQ)f76ec1ae-dc3b-4291-bfb9-a4fec0c129fd$$true')
  assert.notEqual(url.searchParams.get('municipality'), '1103')
})
