import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseEdgeOfNorwayListPage, parseEdgeOfNorwayListPageWithStats, mergeRegionalEvents, stableBaseEventId, stableOccurrenceId, parseDateHeading, extractTime, parseEdgeOfNorwayDetailPage, EDGE_OF_NORWAY_SOURCE_PAGES, isFjordNorwayEventDetailUrl } from '../app/lib/integrations/local-events/edge-of-norway-provider.ts'

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/edge-of-norway/${name}`, import.meta.url), 'utf8')

test('candidate discovery only accepts strict Fjord Norway event detail URLs', () => {
  assert.equal(isFjordNorwayEventDetailUrl('https://www.fjordnorway.com/en/events/cathedral-secrets', 'https://www.edgeofnorway.com/en/events'), true)
  assert.equal(isFjordNorwayEventDetailUrl('https://www.fjordnorway.com/en/events', 'https://www.edgeofnorway.com/en/events'), false)
  assert.equal(isFjordNorwayEventDetailUrl('https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=stavanger', 'https://www.edgeofnorway.com/en/events'), false)
  assert.equal(isFjordNorwayEventDetailUrl('/en/events/navigation-link', 'https://www.edgeofnorway.com/en/events'), false)
})

test('list parser ignores Edge of Norway navigation and filter links as candidates', () => {
  const html = `
    <nav>
      <a href="https://www.edgeofnorway.com/en/events">What's on?</a>
      <a href="https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=stavanger">Select place</a>
      <a href="https://www.edgeofnorway.com/en/events?filtertype=category">Select category</a>
    </nav>
    <h2>11 July</h2>
    <article class="event-card">
      <a href="https://www.fjordnorway.com/en/events/cathedral-secrets">Cathedral secrets</a>
      <time>11:00</time>
      <a href="https://www.fjordnorway.com/en/events/cathedral-secrets">Read more</a>
    </article>
  `
  const { cards, stats } = parseEdgeOfNorwayListPageWithStats(html, 'stavanger', { referenceDate: new Date('2026-07-01T00:00:00Z'), requestUrl: 'https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=stavanger' })
  assert.equal(stats.fjordNorwayEventLinkCount, 2)
  assert.equal(stats.candidateCardCount, 1)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].title, 'Cathedral secrets')
})

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
  assert.equal(cards.find(c => c.title.includes('Gladmat')).canonicalUrl, 'https://www.fjordnorway.com/en/events/gladmat-concert')
  assert.ok(cards.every(c => !['Book', 'Read more', 'Buy tickets', 'Tickets'].includes(c.title)))
  assert.equal(cards.find(c => c.title.includes('Sola')).startTime, '19:00')
  assert.equal(cards.find(c => c.title.includes('Egersund')).allDay, true)
  assert.ok(cards.every(c => c.canonicalUrl.startsWith('https://')))
})



test('list parser handles server-returned Edge of Norway div cards and reports parse diagnostics', () => {
  const { cards, stats } = parseEdgeOfNorwayListPageWithStats(fixture('server-returned-list-shape.html'), 'stavanger', { referenceDate: new Date('2026-07-01T00:00:00Z'), requestUrl: 'https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=stavanger', status: 200 })
  assert.equal(stats.requestUrl.includes('place=stavanger'), true)
  assert.equal(stats.status, 200)
  assert.equal(stats.dateHeadingCount, 2)
  assert.equal(stats.fjordNorwayEventLinkCount, 6)
  assert.equal(stats.candidateCardCount, 3)
  assert.equal(stats.parsedCardCount, 3)
  assert.equal(stats.rejectedMissingTitle, 0)
  assert.equal(stats.rejectedMissingDate, 0)
  assert.equal(stats.rejectedMissingSourceUrl, 0)
  assert.equal(cards[0].title, 'Uncovering the Secrets of Stavanger Cathedral by the Museum of Archaeology')
  assert.equal(cards[0].date, '2026-07-11')
  assert.equal(cards[0].startTime, '11:00')
  assert.equal(cards[1].canonicalUrl, 'https://www.fjordnorway.com/en/events/viking-summer')
})

test('current sanitized Edge of Norway card uses heading, Read more URL, visible time and ignores Book CTA', () => {
  const cards = parseEdgeOfNorwayListPage('<h2>11. July</h2>' + fixture('current-event-card-sanitized.html'), 'stavanger', new Date('2026-07-01T00:00:00Z'))
  assert.equal(cards.length, 1)
  assert.equal(cards[0].title, 'Football festival in Vågen on 11 July – Norway v England')
  assert.equal(cards[0].canonicalUrl, 'https://www.fjordnorway.com/en/events/football-festival-in-vagen-on-11-july-norway-v-england')
  assert.equal(cards[0].startTime, '17:00')
  assert.equal(cards[0].timeSource, 'card')
  assert.equal(cards[0].shortDescription.includes('Doors open'), true)
  assert.equal(cards[0].category, 'Sport')
})

test('list parser uses explicit card date when no broad date heading is present', () => {
  const html = `
    <div class="search-result-card">
      <a href="https://www.fjordnorway.com/en/events/no-heading-date">No heading date event</a>
      <div class="card-date">12. juli</div>
      <time datetime="2026-07-12T14:00:00+02:00">14:00</time>
      <a href="https://www.fjordnorway.com/en/events/no-heading-date">Read more</a>
    </div>
  `
  const { cards, stats } = parseEdgeOfNorwayListPageWithStats(html, 'stavanger', { referenceDate: new Date('2026-07-01T00:00:00Z') })
  assert.equal(stats.rejectedMissingDate, 0)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].date, '2026-07-12')
})

test('year transitions assign January headings to upcoming year when discovered in December', () => {
  assert.equal(parseDateHeading('<h2>2 January</h2>', new Date('2026-12-15T00:00:00Z')), '2027-01-02')
})



test('compact card date labels parse with abbreviations, full months and optional trailing periods', () => {
  assert.equal(parseDateHeading('11. Jul.', new Date('2026-07-11T00:00:00Z')), '2026-07-11')
  assert.equal(parseDateHeading('11 Jul', new Date('2026-07-11T00:00:00Z')), '2026-07-11')
  assert.equal(parseDateHeading('11. July', new Date('2026-07-11T00:00:00Z')), '2026-07-11')
  assert.equal(parseDateHeading('04. Aug.', new Date('2026-07-11T00:00:00Z')), '2026-08-04')
  assert.equal(parseDateHeading('4 Aug', new Date('2026-07-11T00:00:00Z')), '2026-08-04')
  assert.equal(parseDateHeading('4. August', new Date('2026-07-11T00:00:00Z')), '2026-08-04')
})

test('year resolution uses the 30 day source page range including December/January rollover', () => {
  assert.equal(parseDateHeading('09. Aug.', new Date('2026-07-11T00:00:00Z')), '2026-08-09')
  assert.equal(parseDateHeading('2 January', new Date('2026-12-20T00:00:00Z')), '2027-01-02')
  assert.equal(parseDateHeading('27 December', new Date('2026-12-20T00:00:00Z')), '2026-12-27')
})

test('Sandnes, Sola and Egersund cards receive compact card dates without heading tags', () => {
  const html = (place, day, title) => `<section><div>not a heading</div><li class="event-card"><div class="event-card__date">${day}</div><a href="https://www.fjordnorway.com/en/events/${place}-compact">${title}</a><a href="https://www.fjordnorway.com/en/events/${place}-compact">Read more</a></li></section>`
  for (const [place, day, title] of [['sandnes', '11. Jul.', 'Sandnes compact'], ['sola', '04. Aug.', 'Sola compact'], ['egersund', '4 August', 'Egersund compact']]) {
    const { cards, stats } = parseEdgeOfNorwayListPageWithStats(html(place, day, title), place, { referenceDate: new Date('2026-07-11T00:00:00Z') })
    assert.equal(cards.length, 1)
    assert.equal(stats.dateFromCompactCard, 1)
    assert.equal(stats.rejectedActualEventMissingDate, 0)
  }
})

test('detail page showings override false daily list repetition for Every Friday in July', () => {
  const cards = ['11. Jul.', '12. Jul.', '13. Jul.', '18. Jul.'].flatMap((date) => parseEdgeOfNorwayListPage(`<li class="event-card"><div>${date}</div><a href="https://www.fjordnorway.com/en/events/every-friday-in-july">Every Friday in July at Melkebaren</a><p class="description">Every Friday in July. Show 7-9 pm.</p></li>`, 'sandnes', new Date('2026-07-11T00:00:00Z')))
  const { occurrences } = mergeRegionalEvents(cards, { 'https://www.fjordnorway.com/en/events/every-friday-in-july': '<main><p>Every Friday in July.</p><p>11 July 19:00</p><p>18 July 19:00</p></main>' })
  assert.deepEqual(occurrences.map(o => o.date), ['2026-07-11', '2026-07-18'])
  assert.equal(occurrences.length, 2)
})

test('time extraction supports common formats', () => {
  assert.deepEqual(extractTime('kl. 18.30'), { startTime: '18:30', endTime: null })
  assert.deepEqual(extractTime('18:30–20:00'), { startTime: '18:30', endTime: '20:00' })
  assert.deepEqual(extractTime('klokken 11'), { startTime: '11:00', endTime: null })
  assert.deepEqual(extractTime('Show 7–9 pm'), { startTime: '19:00', endTime: '21:00' })
})

test('detail page parser can provide missing start time from public detail HTML', () => {
  const detail = parseEdgeOfNorwayDetailPage(fixture('detail-time.html'), 'https://www.fjordnorway.com/en/events/no-time', '2026-07-14')
  assert.equal(detail.showings[0].startTime, '18:30')
  assert.equal(detail.canonicalUrl, 'https://www.fjordnorway.com/en/events/no-time')
})

test('regional merge deduplicates by canonical URL and classifies continuous/session/one-off', () => {
  const cards = [
    ...parseEdgeOfNorwayListPage(fixture('stavanger.html'), 'stavanger', new Date('2026-07-01T00:00:00Z')),
    ...parseEdgeOfNorwayListPage(fixture('sandnes.html'), 'sandnes', new Date('2026-07-01T00:00:00Z')),
  ]
  const { occurrences, stats } = mergeRegionalEvents(cards, {
    'https://www.fjordnorway.com/en/events/harbour-exhibition': fixture('continuous-detail.html'),
    'https://www.fjordnorway.com/en/events/guided-tour': fixture('sessions-detail.html'),
  })
  assert.equal(stats.uniqueEventsAfterGrouping, 3)
  assert.equal(occurrences.filter(o => o.classification === 'continuous').length, 1)
  assert.equal(occurrences.filter(o => o.classification === 'separate_session').length, 2)
  assert.equal(occurrences.filter(o => o.classification === 'one_off').length, 1)
  assert.equal(occurrences.find(o => o.classification === 'continuous').endDate, '2026-07-12')
})

test('stable IDs are deterministic and occurrence IDs include date/time', () => {
  const url = 'https://www.fjordnorway.com/en/events/gladmat-concert'
  assert.equal(stableBaseEventId(url), stableBaseEventId(url.toUpperCase()))
  assert.equal(stableOccurrenceId(url, '2026-07-11', '18:30'), `${stableBaseEventId(url)}:2026-07-11:18:30`)
})

test('selected city is stored preference only and does not alter regional source list', () => {
  assert.ok(EDGE_OF_NORWAY_SOURCE_PAGES.some(p => p.slug === 'egersund'))
  assert.equal(EDGE_OF_NORWAY_SOURCE_PAGES.length, 4)
})
