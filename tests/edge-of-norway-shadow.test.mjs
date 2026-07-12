import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EDGE_OF_NORWAY_STAVANGER_LIST_URL, parseEdgeOfNorwayListPage, runEdgeOfNorwayShadowDiagnostic } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const fixture = (name) => readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')
const ref = '2026-07-12'
const footballUrl = 'https://www.fjordnorway.com/en/events/football-festival-in-vagen-on-11-july-norway-v-england'
const accepted = (html) => parseEdgeOfNorwayListPage(html, EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref).results.filter((r) => r.accepted).map((r) => r.event)
const skipped = (html) => parseEdgeOfNorwayListPage(html, EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref).results.filter((r) => !r.accepted).map((r) => r.reason)

test('football regression accepts badge date 11 July and never active calendar 19 July', () => {
  const result = accepted(fixture('stavanger-list.html')).find((event) => event.sourceUrl === footballUrl)
  assert.ok(result)
  assert.deepEqual(result, { title: 'Football festival in Vågen on 11 July – Norway v England', sourceUrl: footballUrl, date: '2026-07-11', startTime: '17:00', allDay: false })
  assert.equal(result.date, '2026-07-11')
  assert.notEqual(result.date, '2026-07-19')
})

test('one date with time', () => assert.deepEqual(accepted(fixture('one-date-with-time.html'))[0], { title: 'Evening concert', sourceUrl: 'https://www.fjordnorway.com/en/events/evening-concert', date: '2026-07-12', startTime: '19:30', allDay: false }))
test('one date without time is all-day', () => assert.deepEqual(accepted(fixture('one-date-no-time.html'))[0], { title: 'Street market', sourceUrl: 'https://www.fjordnorway.com/en/events/street-market', date: '2026-07-12', startTime: null, allDay: true }))
test('missing badge date', () => assert.deepEqual(skipped(fixture('missing-badge-date.html')), ['unclear_date']))
test('unclear badge date', () => assert.deepEqual(skipped(fixture('unclear-badge-date.html')), ['unclear_date']))
test('multiple dates in one card', () => assert.deepEqual(skipped(fixture('multiple-dates-one-card.html')), ['multiple_dates']))
test('same canonical URL on multiple dates remains raw and ungrouped', () => assert.equal(accepted(fixture('same-url-multiple-dates.html')).length, 2))
test('exact duplicate cards remain raw and ungrouped', () => { const result = parseEdgeOfNorwayListPage(fixture('exact-duplicate-cards.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref); assert.equal(result.exactDuplicateCardsRemoved, 0); assert.equal(result.results.length, 2); assert.equal(result.results[0].accepted, true) })
test('missing title', () => assert.deepEqual(skipped(fixture('missing-title.html')), ['missing_title']))
test('missing Read more URL', () => assert.deepEqual(skipped(fixture('missing-read-more-url.html')), ['missing_source_url']))
test('unrelated dates elsewhere on page are ignored', () => { const result = accepted(fixture('unrelated-dates-elsewhere.html'))[0]; assert.equal(result.date, '2026-07-11'); assert.notEqual(result.date, '2026-07-19') })
test('selected or active calendar dates are ignored', () => { const result = accepted(fixture('selected-active-calendar.html'))[0]; assert.equal(result.date, '2026-07-11'); assert.notEqual(result.date, '2026-07-19') })
test('time from neighbouring card is not used', () => { const events = accepted(fixture('neighbour-time.html')); assert.equal(events[0].startTime, null); assert.equal(events[0].allDay, true); assert.equal(events[1].startTime, '17:00') })


test('all fields are scoped to their own card', () => {
  const result = parseEdgeOfNorwayListPage(fixture('scoped-two-cards.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.cardsDiscovered, 2)
  assert.deepEqual(result.rawCards, [
    { title: 'First scoped title', badgeText: '12. Jul.', timeText: '10:00', sourceUrl: 'https://www.fjordnorway.com/en/events/first-scoped' },
    { title: 'Second scoped title', badgeText: '13. Jul.', timeText: '21:30', sourceUrl: 'https://www.fjordnorway.com/en/events/second-scoped' },
  ])
  const second = result.results[1]
  assert.equal(second.accepted, true)
  if (second.accepted) {
    assert.deepEqual(second.event, { title: 'Second scoped title', sourceUrl: 'https://www.fjordnorway.com/en/events/second-scoped', date: '2026-07-13', startTime: '21:30', allDay: false })
    assert.notEqual(second.event.title, 'First scoped title')
    assert.notEqual(second.event.date, '2026-07-12')
    assert.notEqual(second.event.startTime, '10:00')
    assert.notEqual(second.event.sourceUrl, 'https://www.fjordnorway.com/en/events/first-scoped')
  }
})

test('shadow diagnostic parses list page only and reports list-card metrics', async () => {
  const fetchedUrls = []
  const fetchImpl = async (requestUrl) => { fetchedUrls.push(String(requestUrl)); return { ok: true, text: async () => fixture('stavanger-list.html') } }
  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl, ref)
  assert.deepEqual(fetchedUrls, [EDGE_OF_NORWAY_STAVANGER_LIST_URL])
  assert.equal(result.cardsDiscovered, 3)
  assert.equal(result.exactDuplicateCardsRemoved, 0)
  assert.equal(result.acceptedCount, 3)
  assert.deepEqual(result.skippedCounts, {})
  assert.equal(result.acceptedEvents[0].date, '2026-07-11')
  assert.notEqual(result.acceptedEvents[0].date, '2026-07-19')
})

test('real card wrapper selector discovers only physical cards, not child wrappers', () => {
  const result = parseEdgeOfNorwayListPage(fixture('live-card-boundary.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.cardsDiscovered, 2)
  assert.equal(result.results.length, 2)
})

test('live card boundary starts from Read more and resolves one root per physical card', () => {
  const result = parseEdgeOfNorwayListPage(fixture('live-card-boundary.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.cardsDiscovered, 2)
  assert.deepEqual(result.cardRoots.map((root) => root.tagName), ['li', 'li'])
  assert.equal(result.results.length, 2)
  assert.equal(result.results[0].accepted, true)
  assert.equal(result.results[1].accepted, true)
  assert.deepEqual(result.results[0].event, { title: 'Football festival in Vågen on 11 July – Norway v England', sourceUrl: footballUrl, date: '2026-07-11', startTime: '17:00', allDay: false })
  assert.notEqual(result.results[0].event.date, '2026-07-19')
})
