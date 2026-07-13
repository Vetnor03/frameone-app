import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EDGE_OF_NORWAY_EVENTS_URL, parseEdgeOfNorwayListPage, runEdgeOfNorwayShadowDiagnostic } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const fixture = (name) => readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')
const events = (html) => parseEdgeOfNorwayListPage(html, EDGE_OF_NORWAY_EVENTS_URL).results.filter((r) => r.accepted).map((r) => r.event)

const eventHtml = (event) => `self.__next_f.push(${JSON.stringify([1, JSON.stringify({ data: event })])});`
const scheduleProbeHtml = (schedule) => eventHtml({
  _id: `schedule-probe-${JSON.stringify(schedule)}`,
  _type: 'Event',
  locTitle: { en: 'Schedule Probe' },
  locSlug: { en: { current: 'schedule-probe' } },
  event: { _type: 'EventInfo', recurring: false, recurringShowings: null, showings: [{ date: '2026-07-26', schedule }] },
})
const eventFromSchedule = (schedule) => parseEdgeOfNorwayListPage(scheduleProbeHtml(schedule)).results.find((r) => r.accepted)?.event
const reasonFromSchedule = (schedule) => parseEdgeOfNorwayListPage(scheduleProbeHtml(schedule)).results.find((r) => !r.accepted)?.reason

test('configured Edge of Norway list URL uses official Stavanger-area place filters', () => {
  assert.equal(EDGE_OF_NORWAY_EVENTS_URL, 'https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=stavanger&place=sandnes&place=sola&place=randaberg&place=rennesoy-and-the-green-islands&place=kvitsoy&place=swords-in-rock&place=jorpeland&place=tau&place=strand-municipality&place=preikestolen')
  const url = new URL(EDGE_OF_NORWAY_EVENTS_URL)
  assert.equal(url.searchParams.get('date'), 'next_30')
  assert.equal(url.searchParams.get('filtertype'), 'place')
  assert.deepEqual(url.searchParams.getAll('place'), ['stavanger', 'sandnes', 'sola', 'randaberg', 'rennesoy-and-the-green-islands', 'kvitsoy', 'swords-in-rock', 'jorpeland', 'tau', 'strand-municipality', 'preikestolen'])
})

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


test('EventSchedule string hour and minutes normalize to padded start times', () => {
  assert.equal(eventFromSchedule([{ hour: '17', minutes: '00' }])?.startTime, '17:00')
  assert.equal(eventFromSchedule([{ hour: '9', minutes: '5' }])?.startTime, '09:05')
  assert.equal(eventFromSchedule([{ hour: 18, minutes: 0 }])?.startTime, '18:00')
  assert.equal(eventFromSchedule([{ hour: '00', minutes: '00' }])?.startTime, '00:00')
})

test('malformed non-empty EventSchedule values are unclear_time', () => {
  assert.equal(reasonFromSchedule([{ hour: '24', minutes: '00' }]), 'unclear_time')
  assert.equal(reasonFromSchedule([{ hour: '17', minutes: '60' }]), 'unclear_time')
  assert.equal(reasonFromSchedule([{ hour: 'noon', minutes: '00' }]), 'unclear_time')
  assert.equal(reasonFromSchedule([{ hour: '17', minutes: 'zero' }]), 'unclear_time')
})

test('duplicate normalized EventSchedule representations collapse and empty schedule remains all-day', () => {
  assert.equal(eventFromSchedule([{ hour: '17', minutes: '00' }, { hour: 17, minutes: 0 }])?.startTime, '17:00')
  assert.deepEqual(eventFromSchedule([]), { title: 'Schedule Probe', sourceUrl: 'https://www.fjordnorway.com/en/events/schedule-probe', date: '2026-07-26', startTime: null, allDay: true })
})

test('shadow diagnostic reports structured flight metrics from list page only', async () => {
  const fetchedUrls = []
  const fetchImpl = async (requestUrl, init) => {
    fetchedUrls.push(String(requestUrl))
    assert.equal(init.redirect, 'manual')
    return new Response(fixture('flight-payload.html'), { status: 200, headers: { 'content-type': 'text/html' } })
  }
  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl)
  assert.deepEqual(fetchedUrls, [EDGE_OF_NORWAY_EVENTS_URL])
  assert.equal(result.fetch?.requestedUrl, EDGE_OF_NORWAY_EVENTS_URL)
  assert.equal(result.fetch?.finalHostname, 'www.edgeofnorway.com')
  assert.equal(result.flightScriptsFound, 5)
  assert.equal(result.flightChunksDecoded, 3)
  assert.equal(result.uniqueEvents, 7)
  assert.equal(result.acceptedCount, 4)
  assert.equal(result.skippedCounts.recurring_event, 1)
})

test('response from www.edgeofnorway.com is accepted', async () => {
  const response = new Response(fixture('flight-payload.html'), { status: 200 })
  Object.defineProperty(response, 'url', { value: EDGE_OF_NORWAY_EVENTS_URL })
  const result = await runEdgeOfNorwayShadowDiagnostic(async () => response)
  assert.equal(result.diagnosticError, undefined)
  assert.equal(result.fetch?.finalHostname, 'www.edgeofnorway.com')
  assert.equal(result.acceptedCount, 4)
})

test('redirect or final URL on www.fjordnorway.com is rejected before parsing', async () => {
  const response = new Response(fixture('flight-payload.html'), { status: 200 })
  Object.defineProperty(response, 'url', { value: 'https://www.fjordnorway.com/en/events' })
  const result = await runEdgeOfNorwayShadowDiagnostic(async () => response)
  assert.equal(result.diagnosticError?.stage, 'fetch')
  assert.equal(result.diagnosticError?.message, 'Unexpected source redirect')
  assert.equal(result.diagnosticError?.requestedUrl, EDGE_OF_NORWAY_EVENTS_URL)
  assert.equal(result.diagnosticError?.finalUrl, 'https://www.fjordnorway.com/en/events')
  assert.equal(result.acceptedCount, 0)
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

const seriesEvent = ({ id, title = 'Summer at sea', slug = id, date = '2026-07-27', venueName = 'Harbour Pier', hour = 10, minutes = 0, description = 'A family-friendly maritime programme.' }) => ({
  _id: id,
  _type: 'Event',
  locTitle: { en: title },
  locSlug: { en: { current: slug } },
  locShortDescription: { en: description },
  venue: { name: venueName },
  event: { _type: 'EventInfo', recurring: false, recurringShowings: null, showings: [{ date, schedule: [{ hour, minutes }] }] },
})
const eventsHtml = (items) => `self.__next_f.push(${JSON.stringify([1, items.map((event) => JSON.stringify({ data: event })).join(',')])});`

const acceptedTitles = (result) => result.results.filter((entry) => entry.accepted).map((entry) => entry.event.title)

test('same title, venue, time and description on several dates becomes repeated_series', () => {
  const result = parseEdgeOfNorwayListPage(eventsHtml([
    seriesEvent({ id: 'summer-1', slug: 'summer-at-sea-1', date: '2026-07-27' }),
    seriesEvent({ id: 'summer-2', slug: 'summer-at-sea-2', date: '2026-07-28' }),
    seriesEvent({ id: 'single', title: 'One night concert', slug: 'one-night-concert', date: '2026-07-29' }),
  ]))
  assert.equal(result.acceptedCount, 1)
  assert.equal(result.skippedCounts.repeated_series, 2)
  assert.equal(result.repeatedSeriesCount, 1)
  assert.equal(result.repeatedSeriesEventsCount, 2)
  assert.deepEqual(result.repeatedSeriesExamples[0], {
    title: 'Summer at sea',
    venueName: 'Harbour Pier',
    startTime: '10:00',
    dates: ['2026-07-27', '2026-07-28'],
    sourceUrls: ['https://www.fjordnorway.com/en/events/summer-at-sea-1', 'https://www.fjordnorway.com/en/events/summer-at-sea-2'],
  })
  assert.deepEqual(acceptedTitles(result), ['One night concert'])
})

test('different titles do not group as repeated_series', () => {
  const result = parseEdgeOfNorwayListPage(eventsHtml([
    seriesEvent({ id: 'different-title-1', title: 'Summer at sea', date: '2026-07-27' }),
    seriesEvent({ id: 'different-title-2', title: 'Winter at sea', date: '2026-07-28' }),
  ]))
  assert.equal(result.acceptedCount, 2)
  assert.equal(result.skippedCounts.repeated_series, undefined)
})

test('same title at different venues does not group as repeated_series', () => {
  const result = parseEdgeOfNorwayListPage(eventsHtml([
    seriesEvent({ id: 'venue-1', venueName: 'Harbour Pier', date: '2026-07-27' }),
    seriesEvent({ id: 'venue-2', venueName: 'City Museum', date: '2026-07-28' }),
  ]))
  assert.equal(result.acceptedCount, 2)
  assert.equal(result.skippedCounts.repeated_series, undefined)
})

test('same title at different times does not group as repeated_series', () => {
  const result = parseEdgeOfNorwayListPage(eventsHtml([
    seriesEvent({ id: 'time-1', hour: 10, date: '2026-07-27' }),
    seriesEvent({ id: 'time-2', hour: 12, date: '2026-07-28' }),
  ]))
  assert.equal(result.acceptedCount, 2)
  assert.equal(result.skippedCounts.repeated_series, undefined)
})

test('same title with materially different descriptions does not group as repeated_series', () => {
  const result = parseEdgeOfNorwayListPage(eventsHtml([
    seriesEvent({ id: 'description-1', description: 'A family-friendly maritime programme.', date: '2026-07-27' }),
    seriesEvent({ id: 'description-2', description: 'A late-night music cruise for adults.', date: '2026-07-28' }),
  ]))
  assert.equal(result.acceptedCount, 2)
  assert.equal(result.skippedCounts.repeated_series, undefined)
})

test('a genuine single event remains accepted after repeated-series filtering', () => {
  const result = parseEdgeOfNorwayListPage(eventsHtml([seriesEvent({ id: 'single-genuine', title: 'Genuine single event', date: '2026-07-27' })]))
  assert.equal(result.acceptedCount, 1)
  assert.deepEqual(acceptedTitles(result), ['Genuine single event'])
  assert.equal(result.repeatedSeriesCount, 0)
  assert.equal(result.repeatedSeriesEventsCount, 0)
})

test('recurring, exhibition, multiple-date and multiple-time rules remain unchanged with repeated-series filtering', () => {
  const recurring = seriesEvent({ id: 'recurring-rule', title: 'Recurring rule' })
  recurring.event.recurring = true
  const exhibition = seriesEvent({ id: 'exhibition-rule', title: 'Harbour exhibition' })
  const multipleDate = seriesEvent({ id: 'multiple-date-rule', title: 'Multiple date rule' })
  multipleDate.event.showings.push({ date: '2026-07-28', schedule: [{ hour: 10, minutes: 0 }] })
  const multipleTime = seriesEvent({ id: 'multiple-time-rule', title: 'Multiple time rule' })
  multipleTime.event.showings[0].schedule.push({ hour: 11, minutes: 0 })
  const result = parseEdgeOfNorwayListPage(eventsHtml([recurring, exhibition, multipleDate, multipleTime]))
  assert.equal(result.acceptedCount, 0)
  assert.equal(result.skippedCounts.recurring_event, 1)
  assert.equal(result.skippedCounts.exhibition_or_continuous, 1)
  assert.equal(result.skippedCounts.multiple_dates, 1)
  assert.equal(result.skippedCounts.multiple_times, 1)
  assert.equal(result.skippedCounts.repeated_series, undefined)
})
