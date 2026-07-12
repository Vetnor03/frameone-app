import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EDGE_OF_NORWAY_STAVANGER_LIST_URL, parseEdgeOfNorwayListPage, runEdgeOfNorwayShadowDiagnostic } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const fixture = (name) => readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')
const ref = '2026-07-12'
const footballUrl = 'https://www.fjordnorway.com/en/events/football-festival-in-vagen-on-11-july-norway-v-england'
const events = (html) => parseEdgeOfNorwayListPage(html, EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref).results.filter((r) => r.accepted).map((r) => r.event)

test('fixture date groups bound occurrences and keep neighbouring events separate', () => {
  const result = parseEdgeOfNorwayListPage(fixture('date-groups-live-structure.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.dateGroupsDiscovered, 2)
  assert.equal(result.titleOccurrencesDiscovered, 5)
  assert.equal(result.rawOccurrencesParsed, 5)
  assert.equal(result.rawCards[0].title, 'Viking - Sandefjord')
  assert.equal(result.rawCards[0].date, '2026-07-18')
  assert.equal(result.rawCards[0].timeText, '18:00')
  assert.equal(result.rawCards[1].title, 'No time card')
  assert.equal(result.rawCards[1].date, '2026-07-18')
  assert.equal(result.rawCards[1].timeText, null)
})

test('title and matching Read more URL are paired, Book links ignored, and time is scoped between title and Read more', () => {
  const result = parseEdgeOfNorwayListPage(fixture('date-groups-live-structure.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  const accepted = result.results.filter((r) => r.accepted).map((r) => r.event)
  assert.deepEqual(accepted.find((event) => event.title === 'Viking - Sandefjord'), { title: 'Viking - Sandefjord', sourceUrl: 'https://www.fjordnorway.com/en/events/viking-sandefjord', date: '2026-07-18', startTime: '18:00', allDay: false })
  assert.deepEqual(accepted.find((event) => event.title === 'No time card'), { title: 'No time card', sourceUrl: 'https://www.fjordnorway.com/en/events/no-time-card', date: '2026-07-18', startTime: null, allDay: true })
  assert.deepEqual(accepted.find((event) => event.title === 'Stavanger Football Festival in Vågen | FINAL'), { title: 'Stavanger Football Festival in Vågen | FINAL', sourceUrl: 'https://www.fjordnorway.com/en/events/stavanger-football-festival-in-vagen-final', date: '2026-07-19', startTime: '17:00', allDay: false })
  assert.equal(accepted.some((event) => event.sourceUrl.includes('tickets.example')), false)
})

test('recurring URLs are skipped only after raw parsing across date groups', () => {
  const result = parseEdgeOfNorwayListPage(fixture('date-groups-live-structure.html'), EDGE_OF_NORWAY_STAVANGER_LIST_URL, ref)
  assert.equal(result.rawCards.filter((card) => card.sourceUrl === 'https://www.fjordnorway.com/en/events/repeated-url').length, 2)
  assert.equal(result.results.filter((r) => !r.accepted && r.reason === 'recurring_event').length, 2)
  assert.equal(result.groupedFailureCounts.recurring_event, 2)
})

test('football regression accepts 11 July and explicitly never borrows 19 July', () => {
  const event = events(fixture('date-groups-football-regression.html')).find((entry) => entry.sourceUrl === footballUrl)
  assert.ok(event)
  assert.deepEqual(event, { title: 'Football festival in Vågen on 11 July – Norway v England', sourceUrl: footballUrl, date: '2026-07-11', startTime: '17:00', allDay: false })
  assert.notEqual(event.date, '2026-07-19')
})

test('shadow diagnostic reports date-group metrics from list page only', async () => {
  const fetchedUrls = []
  const fetchImpl = async (requestUrl) => { fetchedUrls.push(String(requestUrl)); return { ok: true, text: async () => fixture('date-groups-live-structure.html') } }
  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl, ref)
  assert.deepEqual(fetchedUrls, [EDGE_OF_NORWAY_STAVANGER_LIST_URL])
  assert.equal(result.dateGroupsDiscovered, 2)
  assert.equal(result.rawOccurrencesParsed, 5)
  assert.equal(result.acceptedCount, 3)
  assert.equal(result.skippedCounts.recurring_event, 2)
})
