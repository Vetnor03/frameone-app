import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseEdgeOfNorwayListPage, mergeRegionalEvents, stableBaseEventId, stableOccurrenceId, parseDateHeading, extractTime, parseEdgeOfNorwayDetailPage, EDGE_OF_NORWAY_SOURCE_PAGES } from '../app/lib/integrations/local-events/edge-of-norway-provider.ts'

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')

test('configured public place slugs include Stavanger, Sandnes, Sola and Egersund', () => {
  assert.deepEqual(EDGE_OF_NORWAY_SOURCE_PAGES.map(p => p.slug), ['stavanger', 'sandnes', 'sola', 'egersund'])
  assert.ok(EDGE_OF_NORWAY_SOURCE_PAGES.every(p => p.url.includes('date=next_30') && p.url.includes(`place=${p.slug}`)))
})

test('list parser extracts date groups, canonical URLs, card time, description time and all-day', () => {
  const cards = [
    ...parseEdgeOfNorwayListPage(fixture('stavanger.html'), 'stavanger', new Date('2026-07-01T00:00:00Z')),
    ...parseEdgeOfNorwayListPage(fixture('sola.html'), 'sola', new Date('2026-07-01T00:00:00Z')),
    ...parseEdgeOfNorwayListPage(fixture('egersund.html'), 'egersund', new Date('2026-07-01T00:00:00Z')),
  ]
  assert.equal(cards.find(c => c.title.includes('Gladmat')).date, '2026-07-11')
  assert.equal(cards.find(c => c.title.includes('Gladmat')).startTime, '18:30')
  assert.equal(cards.find(c => c.title.includes('Sola')).startTime, '19:00')
  assert.equal(cards.find(c => c.title.includes('Egersund')).allDay, true)
  assert.ok(cards.every(c => c.canonicalUrl.startsWith('https://')))
})

test('year transitions assign January headings to upcoming year when discovered in December', () => {
  assert.equal(parseDateHeading('<h2>2 January</h2>', new Date('2026-12-15T00:00:00Z')), '2027-01-02')
})

test('time extraction supports common formats', () => {
  assert.deepEqual(extractTime('kl. 18.30'), { startTime: '18:30', endTime: null })
  assert.deepEqual(extractTime('18:30–20:00'), { startTime: '18:30', endTime: '20:00' })
  assert.deepEqual(extractTime('klokken 11'), { startTime: '11:00', endTime: null })
})

test('detail page parser can provide missing start time from public detail HTML', () => {
  const detail = parseEdgeOfNorwayDetailPage(fixture('detail-time.html'), 'https://www.fjordnorway.com/en/see-and-do/no-time', '2026-07-14')
  assert.equal(detail.showings[0].startTime, '18:30')
  assert.equal(detail.canonicalUrl, 'https://www.fjordnorway.com/en/see-and-do/no-time')
})

test('regional merge deduplicates by canonical URL and classifies continuous/session/one-off', () => {
  const cards = [
    ...parseEdgeOfNorwayListPage(fixture('stavanger.html'), 'stavanger', new Date('2026-07-01T00:00:00Z')),
    ...parseEdgeOfNorwayListPage(fixture('sandnes.html'), 'sandnes', new Date('2026-07-01T00:00:00Z')),
  ]
  const { occurrences, stats } = mergeRegionalEvents(cards, {
    'https://www.fjordnorway.com/en/see-and-do/harbour-exhibition': fixture('continuous-detail.html'),
    'https://www.fjordnorway.com/en/see-and-do/guided-tour': fixture('sessions-detail.html'),
  })
  assert.equal(stats.uniqueEventsAfterGrouping, 3)
  assert.equal(occurrences.filter(o => o.classification === 'continuous').length, 1)
  assert.equal(occurrences.filter(o => o.classification === 'separate_session').length, 2)
  assert.equal(occurrences.filter(o => o.classification === 'one_off').length, 1)
  assert.equal(occurrences.find(o => o.classification === 'continuous').endDate, '2026-07-12')
})

test('stable IDs are deterministic and occurrence IDs include date/time', () => {
  const url = 'https://www.fjordnorway.com/en/see-and-do/gladmat-concert'
  assert.equal(stableBaseEventId(url), stableBaseEventId(url.toUpperCase()))
  assert.equal(stableOccurrenceId(url, '2026-07-11', '18:30'), `${stableBaseEventId(url)}:2026-07-11:18:30`)
})

test('selected city is stored preference only and does not alter regional source list', () => {
  assert.ok(EDGE_OF_NORWAY_SOURCE_PAGES.some(p => p.slug === 'egersund'))
  assert.equal(EDGE_OF_NORWAY_SOURCE_PAGES.length, 4)
})
