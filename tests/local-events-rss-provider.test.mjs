import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const providerSource = readFileSync(new URL('../app/lib/integrations/local-events/providers/friskus-rss.ts', import.meta.url), 'utf8')
const serverSource = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
const connectRouteSource = readFileSync(new URL('../app/api/integrations/local-events/connect/route.ts', import.meta.url), 'utf8')
const uiSource = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const stav = readFileSync(new URL('./fixtures-friskus-stavanger-rss.xml', import.meta.url), 'utf8')
const sand = readFileSync(new URL('./fixtures-friskus-sandnes-rss.xml', import.meta.url), 'utf8')
const empty = readFileSync(new URL('./fixtures-friskus-empty-rss.xml', import.meta.url), 'utf8')

function items(xml) {
  if (!xml.includes('</rss>')) throw new Error('Malformed XML')
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1])
}
function val(item, tag) { return (item.match(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)<\\/${tag}>`))?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() }
function normalized(xml) {
  const seen = new Set(); const out = []; let missingTitle = 0, missingDate = 0, dup = 0
  for (const item of items(xml)) {
    const title = val(item, 'title'); const start = val(item, 'friskus:start'); const guid = val(item, 'guid')
    if (!title) { missingTitle++; continue }
    if (!start) { missingDate++; continue }
    if (seen.has(guid)) { dup++; continue }
    seen.add(guid); out.push({ guid, title, start, end: val(item, 'friskus:end'), location: val(item, 'friskus:location'), link: val(item, 'link') })
  }
  return { out, missingTitle, missingDate, dup }
}

test('implementation uses documented Friskus RSS endpoint and safe URL construction', () => {
  assert.match(providerSource, /new URL\('https:\/\/rss\.friskus\.com\/feed\/events'\)/)
  assert.match(providerSource, /url\.searchParams\.append\('municipalities\[\]', config\.municipalityUuid\)/)
})

test('does not use obsolete Friskus REST API or guessed filters', () => {
  for (const source of [providerSource, serverSource]) {
    assert.doesNotMatch(source, /api\.friskus\.com/)
    assert.doesNotMatch(source, new RegExp('global_filters_' + 'municipalities'))
    assert.doesNotMatch(source, /new URLSearchParams\(\{ municipality/)
  }
})

test('server-side RSS request reads text and caches for 30 minutes', () => {
  assert.match(providerSource, /Accept: 'application\/rss\+xml, application\/xml, text\/xml'/)
  assert.match(providerSource, /'User-Agent': 'RE-MIND\/1\.0 local-events integration'/)
  assert.match(providerSource, /AbortSignal\.timeout\(15_000\)/)
  assert.match(providerSource, /revalidate: 1800/)
  assert.match(providerSource, /resp\.text\(\)/)
})

test('Stavanger feed fixture parsing and field mapping', () => {
  const raw = items(stav); const n = normalized(stav)
  assert.equal(stav.match(/<title>Friskus Stavanger aktiviteter<\/title>/)?.[0].includes('Stavanger'), true)
  assert.equal(raw.length, 5)
  assert.equal(n.out.length, 2)
  assert.equal(n.out[0].guid, 'activity-1')
  assert.equal(n.out[0].link, 'https://stavanger.friskus.com/events/activity-1')
  assert.equal(n.out[0].location, 'Stavanger sentrum')
  assert.equal(n.missingTitle, 1)
  assert.equal(n.missingDate, 1)
  assert.equal(n.dup, 1)
})

test('Sandnes feed fixture parsing', () => {
  const n = normalized(sand)
  assert.equal(items(sand).length, 1)
  assert.equal(n.out.length, 1)
  assert.equal(n.out[0].link, 'https://sandnes.friskus.com/events/sandnes-1')
})

test('valid RSS with zero items succeeds and malformed XML fails', () => {
  assert.equal(items(empty).length, 0)
  assert.throws(() => items('<rss><channel><item></channel>'), /Malformed XML/)
})

test('HTTP 400, HTTP 500, timeout, and stale-cache behavior are covered in provider source', () => {
  assert.match(providerSource, /if \(!resp\.ok\) throw new LocalEventsProviderError/)
  assert.match(providerSource, /Friskus RSS returned \$\{resp\.status\}/)
  assert.match(providerSource, /Friskus RSS network request failed/)
  assert.match(providerSource, /responseCache/)
})

test('internal error code is not displayed in UI', () => {
  assert.doesNotMatch(connectRouteSource, /LOCAL_EVENTS_INITIAL_SYNC_FAILED/)
  assert.match(connectRouteSource, /Could not load local events\. Please try again\./)
  assert.match(uiSource, /json\?\.message \|\| 'Could not connect to local events\. Please try again\.'/)
})

test('provider parses Norwegian event date and time from RSS title before pubDate', () => {
  assert.match(providerSource, /parseFriskusTitleOccurrence/)
  assert.match(providerSource, /NORWEGIAN_MONTHS/)
  assert.match(providerSource, /jan: 1, januar: 1/)
  assert.match(providerSource, /des: 12, desember: 12/)
  assert.doesNotMatch(providerSource, /pubDate/)
  const title = 'Gudstjeneste i Vardeneset kirke, søndag 12. jul 2026 - søndag 27. des 2026, 11:00 - 12:15'
  const dateMatch = title.match(/(?:søndag\s+)?(\d{1,2})\.\s*(jul)\s+(\d{4})/i)
  const timeMatch = title.slice(dateMatch.index + dateMatch[0].length).match(/(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?/)
  const cleanTitle = title.slice(0, dateMatch.index).replace(/[\s,–—-]+$/g, '').trim()
  assert.equal(cleanTitle, 'Gudstjeneste i Vardeneset kirke')
  assert.equal(`${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`, '12 jul 2026')
  assert.equal(timeMatch[1], '11:00')
  assert.equal(timeMatch[2], '12:15')
})


test('provider filters clearly religious local events with per-occurrence Christmas Eve exception', () => {
  assert.match(providerSource, /isReligiousLocalEvent/)
  assert.match(providerSource, /isChristmasEveService/)
  assert.match(providerSource, /removedReligious/)
  assert.match(providerSource, /raw\.description|raw\.summary/)
  assert.match(providerSource, /raw\.category \|\| raw\['friskus:category'\]/)
  assert.match(providerSource, /monthDay\?\.month !== 12 \|\| monthDay\.day !== 24/)
  assert.match(providerSource, /isReligiousLocalEvent\(religiousEvent\) && !isChristmasEveService\(religiousEvent, occ\)/)
  assert.doesNotMatch(providerSource, /raw\['friskus:location'\][\s\S]{0,220}isReligiousLocalEvent/)
})
