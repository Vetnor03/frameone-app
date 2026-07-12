import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EDGE_OF_NORWAY_STAVANGER_LIST_URL, parseEdgeOfNorwayListPage, runEdgeOfNorwayShadowDiagnostic } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const fixture = (name) => readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')
const events = (html) => parseEdgeOfNorwayListPage(html, EDGE_OF_NORWAY_STAVANGER_LIST_URL).results.filter((r) => r.accepted).map((r) => r.event)

test('page with only Loading in main parses structured flight Event objects without DOM cards', () => {
  const result = parseEdgeOfNorwayListPage(fixture('flight-payload.html'))
  assert.equal(result.flightScriptsFound, 5)
  assert.equal(result.flightChunksDecoded, 3)
  assert.equal(result.malformedChunks, 2)
  assert.equal(result.eventObjectsFound, 8)
  assert.equal(result.uniqueEvents, 7)
  assert.equal(result.acceptedCount, 4)
})

test('flight chunks decode in document order, deduplicate by _id, and ignore unrelated dates', () => {
  const accepted = events(fixture('flight-payload.html'))
  assert.deepEqual(accepted.map((event) => event.title), ['Viking - Sandefjord', 'Stavanger Football Festival in Vågen | FINAL', 'Football festival in Vågen on 11 July – Norway v England', 'Harbour market all day'])
  assert.equal(accepted.filter((event) => event.title === 'Viking - Sandefjord').length, 1)
  assert.equal(accepted.some((event) => event.date === '2026-07-19' && event.title !== 'Stavanger Football Festival in Vågen | FINAL'), false)
})

test('known live structured events parse from locTitle, locSlug, showings date and schedule', () => {
  const accepted = events(fixture('flight-payload.html'))
  assert.deepEqual(accepted.find((event) => event.title === 'Viking - Sandefjord'), { title: 'Viking - Sandefjord', sourceUrl: 'https://www.fjordnorway.com/en/events/viking---sandefjord-viktsb2yszsrl9trbasra', date: '2026-07-18', startTime: '18:00', allDay: false })
  assert.deepEqual(accepted.find((event) => event.title === 'Stavanger Football Festival in Vågen | FINAL'), { title: 'Stavanger Football Festival in Vågen | FINAL', sourceUrl: 'https://www.fjordnorway.com/en/events/stavanger-football-festival-in-vagen--final-dgtgyzfvs72c7kjmsiaxw', date: '2026-07-19', startTime: '17:00', allDay: false })
})

test('11 July football regression remains 11 July and never becomes 19 July', () => {
  const result = events(fixture('flight-payload.html')).find((entry) => entry.title === 'Football festival in Vågen on 11 July – Norway v England')
  assert.ok(result)
  assert.equal(result.date, '2026-07-11')
  assert.notEqual(result.date, '2026-07-19')
  assert.deepEqual(result, { title: 'Football festival in Vågen on 11 July – Norway v England', sourceUrl: 'https://www.fjordnorway.com/en/events/football-festival-in-vagen-on-11-july-norway-v-england', date: '2026-07-11', startTime: '17:00', allDay: false })
})

test('recurring, multiple-date and multiple-time Event objects are skipped; no schedule is all-day', () => {
  const result = parseEdgeOfNorwayListPage(fixture('flight-payload.html'))
  assert.equal(result.skippedCounts.recurring_event, 1)
  assert.equal(result.skippedCounts.multiple_dates, 1)
  assert.equal(result.skippedCounts.multiple_times, 1)
  assert.deepEqual(events(fixture('flight-payload.html')).find((event) => event.title === 'Harbour market all day'), { title: 'Harbour market all day', sourceUrl: 'https://www.fjordnorway.com/en/events/harbour-market-all-day', date: '2026-07-23', startTime: null, allDay: true })
})

test('shadow diagnostic reports structured flight metrics from list page only', async () => {
  const fetchedUrls = []
  const fetchImpl = async (requestUrl) => { fetchedUrls.push(String(requestUrl)); return { ok: true, text: async () => fixture('flight-payload.html') } }
  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl)
  assert.deepEqual(fetchedUrls, [EDGE_OF_NORWAY_STAVANGER_LIST_URL])
  assert.equal(result.flightScriptsFound, 5)
  assert.equal(result.flightChunksDecoded, 3)
  assert.equal(result.uniqueEvents, 7)
  assert.equal(result.acceptedCount, 4)
  assert.equal(result.skippedCounts.recurring_event, 1)
})

test('raw HTML containing Flight scripts is detected without DOM parsing', () => {
  const html = '<main>Loading</main>self.__next_f.push([1,"{\\"data\\":{\\"_id\\":\\"raw\\",\\"_type\\":\\"Event\\",\\"locTitle\\":{\\"en\\":\\"Raw Event\\"},\\"locSlug\\":{\\"en\\":{\\"current\\":\\"raw-event\\"}},\\"event\\":{\\"_type\\":\\"EventInfo\\",\\"recurring\\":false,\\"recurringShowings\\":null,\\"showings\\":[{\\"date\\":\\"2026-07-25\\",\\"schedule\\":[{\\"hour\\":12,\\"minutes\\":30}]}]}}}"])'
  const result = parseEdgeOfNorwayListPage(html)
  assert.equal(result.flightScriptsFound, 1)
  assert.equal(result.flightChunksDecoded, 1)
  assert.equal(result.uniqueEvents, 1)
})

test('multiple self.__next_f.push calls are extracted from raw HTML', () => {
  const html = 'self.__next_f.push([1,"first"]);<div></div>self.__next_f.push([1,"second"]);self.__next_f.push([0,"ignored"])'
  const result = parseEdgeOfNorwayListPage(html)
  assert.equal(result.flightScriptsFound, 3)
  assert.equal(result.flightChunksDecoded, 2)
  assert.equal(result.malformedChunks, 1)
})

test('escaped quotes and parentheses inside payload strings do not break push extraction', () => {
  const payload = JSON.stringify([1, 'alpha "quoted" (parentheses) \\ slash'])
  const result = parseEdgeOfNorwayListPage(`self.__next_f.push(${payload});`)
  assert.equal(result.flightScriptsFound, 1)
  assert.equal(result.flightChunksDecoded, 1)
  assert.equal(result.malformedChunks, 0)
})

test('fetch/parser exception cannot become a silent all-zero success response', async () => {
  const result = await runEdgeOfNorwayShadowDiagnostic(async () => { throw Object.assign(new Error('network exploded'), { code: 'ECONNRESET' }) })
  assert.equal(result.flightScriptsFound, 0)
  assert.equal(result.eventObjectsFound, 0)
  assert.equal(result.diagnosticError?.stage, 'fetch')
  assert.equal(result.diagnosticError?.message, 'network exploded')
  assert.equal(result.diagnosticError?.code, 'ECONNRESET')
})

test('HTML page with zero Flight markers produces explicit inspect_input result', async () => {
  const fetchImpl = async () => new Response('<!doctype html><title>Interstitial</title><main>Blocked</main>', { status: 200, headers: { 'content-type': 'text/html' } })
  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl)
  assert.equal(result.diagnosticError?.stage, 'inspect_input')
  assert.equal(result.fetch?.rawFlightMarkerCount, 0)
  assert.equal(result.fetch?.documentTitle, 'Interstitial')
  assert.match(result.fetch?.htmlPreview || '', /Interstitial/)
})
