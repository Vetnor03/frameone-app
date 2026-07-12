import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { EDGE_OF_NORWAY_STAVANGER_LIST_URL, parseEdgeOfNorwayDetailPage, parseEdgeOfNorwayListPage, runEdgeOfNorwayShadowDiagnostic } from '../app/lib/integrations/local-events/edge-of-norway-shadow.ts'

const fixture = (name) => readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')
const url = 'https://www.fjordnorway.com/en/events/football-festival-in-vagen-on-11-july-norway-v-england'

test('list parser discovers only title and canonical Fjord Norway detail URLs', () => {
  const results = parseEdgeOfNorwayListPage(fixture('stavanger-list.html'))
  assert.deepEqual(results, [
    { title: 'Football festival in Vågen on 11 July – Norway v England', sourceUrl: url },
    { title: 'Duplicate card should not fetch', sourceUrl: url },
    { title: 'Multiple showings', sourceUrl: 'https://www.fjordnorway.com/en/events/multiple-showings' },
  ])
})

test('football regression accepts 11 July and never accepts 19 July', () => {
  const result = parseEdgeOfNorwayDetailPage(fixture('football.html'), url)
  assert.equal(result.accepted, true)
  assert.equal(result.event.title, 'Football festival in Vågen on 11 July – Norway v England')
  assert.equal(result.event.date, '2026-07-11')
  assert.notEqual(result.event.date, '2026-07-19')
  assert.equal(result.event.startTime, '17:00')
  assert.equal(result.event.allDay, false)
})

test('date without time is accepted as all-day', () => {
  const result = parseEdgeOfNorwayDetailPage(fixture('date-only.html'), 'https://www.fjordnorway.com/en/events/date-only')
  assert.equal(result.accepted, true)
  assert.equal(result.event.startTime, null)
  assert.equal(result.event.allDay, true)
})

for (const [file, reason] of [
  ['multiple-dates.html', 'multiple_dates'],
  ['recurring.html', 'recurring_event'],
  ['exhibition.html', 'exhibition_or_continuous'],
  ['date-range.html', 'date_range'],
  ['unclear.html', 'unclear_date'],
  ['conflicting.html', 'conflicting_showing_data'],
  ['missing-container.html', 'missing_showing_container'],
]) {
  test(`${file} skips with ${reason}`, () => {
    const result = parseEdgeOfNorwayDetailPage(fixture(file), `https://www.fjordnorway.com/en/events/${file}`)
    assert.equal(result.accepted, false)
    assert.equal(result.reason, reason)
  })
}

test('unrelated embedded dates and active calendar buttons are ignored', () => {
  for (const file of ['unrelated-embedded-date.html', 'selected-calendar-button.html']) {
    const result = parseEdgeOfNorwayDetailPage(fixture(file), `https://www.fjordnorway.com/en/events/${file}`)
    assert.equal(result.accepted, true)
    assert.equal(result.event.date, '2026-07-11')
    assert.notEqual(result.event.date, '2026-07-19')
  }
})


test('shadow diagnostic fetches each deduplicated detail URL once and groups skips', async () => {
  const detailHtml = new Map([
    [url, fixture('football.html')],
    ['https://www.fjordnorway.com/en/events/multiple-showings', fixture('multiple-dates.html')],
  ])
  const fetchedUrls = []
  const fetchImpl = async (requestUrl) => {
    const requestUrlString = String(requestUrl)
    if (requestUrlString === EDGE_OF_NORWAY_STAVANGER_LIST_URL) return { ok: true, text: async () => fixture('stavanger-list.html') }
    fetchedUrls.push(requestUrlString)
    return { ok: true, text: async () => detailHtml.get(requestUrlString) || '' }
  }

  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl)
  assert.equal(result.detailPagesDiscovered, 3)
  assert.equal(result.duplicateUrlsRemoved, 1)
  assert.equal(result.detailPagesFetched, 2)
  assert.equal(new Set(fetchedUrls).size, fetchedUrls.length)
  assert.equal(result.acceptedCount, 1)
  assert.deepEqual(result.skippedCounts, { multiple_dates: 1 })
  assert.deepEqual(result.fetchErrors, [])
  assert.equal(result.acceptedEvents[0].date, '2026-07-11')
  assert.notEqual(result.acceptedEvents[0].date, '2026-07-19')
})


test('shadow diagnostic reports detail fetch failures without throwing', async () => {
  const fetchImpl = async (requestUrl) => {
    const requestUrlString = String(requestUrl)
    if (requestUrlString === EDGE_OF_NORWAY_STAVANGER_LIST_URL) return { ok: true, text: async () => fixture('stavanger-list.html') }
    throw new Error('getaddrinfo ENOTFOUND example.test')
  }

  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl)
  assert.equal(result.detailPagesFetched, 0)
  assert.equal(result.acceptedCount, 0)
  assert.deepEqual(result.skippedCounts, { fetch_failed: 2 })
  assert.equal(result.fetchErrors.length, 2)
  assert.match(result.fetchErrors[0], /ENOTFOUND/)
})
