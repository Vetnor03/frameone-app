import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EDGE_OF_NORWAY_STAVANGER_LIST_URL, parseEdgeOfNorwayListPage, runEdgeOfNorwayShadowDiagnostic } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const fixture = (name) => readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')
const ref = '2026-07-12'
const footballUrl = 'https://www.fjordnorway.com/en/events/football-festival-in-vagen-on-11-july-norway-v-england'
const accepted = (html) => parseEdgeOfNorwayListPage(html, EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref).results.filter((r) => r.accepted).map((r) => r.event)

test('football regression accepts badge date 11 July and never active calendar 19 July', () => {
  const result = accepted(fixture('stavanger-list.html')).find((event) => event.sourceUrl === footballUrl)
  assert.ok(result)
  assert.deepEqual(result, { title: 'Football festival in Vågen on 11 July – Norway v England', sourceUrl: footballUrl, date: '2026-07-11', startTime: '17:00', allDay: false })
  assert.equal(result.date, '2026-07-11')
  assert.notEqual(result.date, '2026-07-19')
})

test('one date with time', () => assert.deepEqual(accepted(fixture('one-date-with-time.html'))[0], { title: 'Evening concert', sourceUrl: 'https://www.fjordnorway.com/en/events/evening-concert', date: '2026-07-12', startTime: '19:30', allDay: false }))
test('one date without time is all-day', () => assert.deepEqual(accepted(fixture('one-date-no-time.html'))[0], { title: 'Street market', sourceUrl: 'https://www.fjordnorway.com/en/events/street-market', date: '2026-07-12', startTime: null, allDay: true }))
test('missing badge date', () => { const result = parseEdgeOfNorwayListPage(fixture('missing-badge-date.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref); assert.deepEqual(result.groupedFailureCounts, { missing_badge_date: 1 }) })
test('unclear badge date', () => { const result = parseEdgeOfNorwayListPage(fixture('unclear-badge-date.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref); assert.deepEqual(result.groupedFailureCounts, { missing_badge_date: 1 }) })
test('multiple dates in one card', () => { const result = parseEdgeOfNorwayListPage(fixture('multiple-dates-one-card.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref); assert.deepEqual(result.groupedFailureCounts, { multiple_badge_dates: 1 }) })
test('same canonical URL on multiple dates remains raw and ungrouped', () => assert.equal(accepted(fixture('same-url-multiple-dates.html')).length, 2))
test('exact duplicate cards remain raw and ungrouped', () => { const result = parseEdgeOfNorwayListPage(fixture('exact-duplicate-cards.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref); assert.equal(result.exactDuplicateCardsRemoved, 0); assert.equal(result.results.length, 2); assert.equal(result.results[0].accepted, true) })
test('missing title', () => { const result = parseEdgeOfNorwayListPage(fixture('missing-title.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref); assert.deepEqual(result.groupedFailureCounts, { missing_title_anchor: 1 }) })
test('missing Read more URL', () => { const result = parseEdgeOfNorwayListPage(fixture('missing-read-more-url.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref); assert.deepEqual(result.groupedFailureCounts, { missing_read_more_anchor: 1 }) })
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



test('recurring URLs resolve nested occurrence list items locally without cross-pairing', () => {
  const result = parseEdgeOfNorwayListPage(fixture('recurring-nested-date-groups.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.titleAnchorsFound, 4)
  assert.equal(result.occurrenceListItemsResolved, 4)
  assert.equal(result.uniqueCardNodes, 4)
  assert.equal(result.rawOccurrencesParsed, 4)
  assert.equal(result.cardRoots.every((root) => root.className === 'event-card'), true)
  assert.deepEqual(result.rawCards.filter((card) => card.sourceUrl === 'https://www.fjordnorway.com/en/events/repeated-event'), [
    { title: 'Repeated event', badgeText: '12. Jul.', timeText: '10:00', sourceUrl: 'https://www.fjordnorway.com/en/events/repeated-event' },
    { title: 'Repeated event', badgeText: '13. Jul.', timeText: '11:00', sourceUrl: 'https://www.fjordnorway.com/en/events/repeated-event' },
    { title: 'Repeated event', badgeText: '14. Jul.', timeText: null, sourceUrl: 'https://www.fjordnorway.com/en/events/repeated-event' },
  ])
  assert.equal(result.groupedFailureCounts.ancestor_contains_other_event || 0, 0)
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

test('deterministic event-link discovery resolves generated-class cards independently', () => {
  const result = parseEdgeOfNorwayListPage(fixture('generated-classes-links.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.eventAnchorsDiscovered, 7)
  assert.equal(result.uniqueEventUrls, 2)
  assert.equal(result.urlGroupsWithTitleAndReadMore, 0)
  assert.equal(result.cardCandidatesResolved, 0)
  assert.equal(result.cardsWithOneBadgeDate, 0)
  assert.equal(result.cardsWithTime, 0)
  assert.equal(result.cardsWithoutTime, 0)
  assert.deepEqual(result.rawCards, [])
  assert.deepEqual(accepted(fixture('generated-classes-links.html')), [])
})

test('event anchors without resolvable cards produce explicit failures instead of silent success', () => {
  const result = parseEdgeOfNorwayListPage('<a href="https://www.fjordnorway.com/en/events/orphan">Orphan event</a>', EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.eventAnchorsDiscovered, 1)
  assert.equal(result.cardsDiscovered, 0)
  assert.deepEqual(result.groupedFailureCounts, { missing_read_more_anchor: 1 })
})
