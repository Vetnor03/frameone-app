import crypto from 'node:crypto'

export const EDGE_OF_NORWAY_PROVIDER_ID = 'edge-of-norway' as const
export const EDGE_OF_NORWAY_TIME_ZONE = 'Europe/Oslo'
export const EDGE_OF_NORWAY_USER_AGENT = 'RE:MIND local events public-page scraper (server-side sync; contact hello@remind.no)'

export type EdgeOfNorwayCity = 'stavanger' | 'sandnes' | 'sola' | 'egersund'
export type EdgeEventClassification = 'one_off' | 'separate_session' | 'continuous'

export const EDGE_OF_NORWAY_CITY_OPTIONS: Array<{ slug: EdgeOfNorwayCity; label: string; municipalityNumber: string }> = [
  { slug: 'stavanger', label: 'Stavanger', municipalityNumber: '1103' },
  { slug: 'sandnes', label: 'Sandnes', municipalityNumber: '1108' },
  { slug: 'sola', label: 'Sola', municipalityNumber: '1124' },
  { slug: 'egersund', label: 'Egersund', municipalityNumber: '1101' },
]

export const EDGE_OF_NORWAY_SOURCE_PAGES = EDGE_OF_NORWAY_CITY_OPTIONS.map((city) => ({
  ...city,
  url: `https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=${city.slug}`,
}))

type TimeSource = 'card' | 'description' | 'detail' | 'all_day'
export type ParsedEdgeCard = { title: string; date: string; startTime: string | null; endTime: string | null; allDay: boolean; canonicalUrl: string; sourcePlace: EdgeOfNorwayCity; category: string | null; shortDescription: string | null; timeSource: TimeSource }
export type NormalizedEdgeOccurrence = { baseEventId: string; occurrenceId: string; provider: typeof EDGE_OF_NORWAY_PROVIDER_ID; title: string; date: string; endDate: string | null; startTime: string | null; endTime: string | null; startsAt: string; endsAt: string | null; allDay: boolean; canonicalUrl: string; classification: EdgeEventClassification; sourcePlaces: EdgeOfNorwayCity[] }
export type MergeStats = { cardsParsedBySource: Record<string, number>; duplicatesRemoved: number; uniqueEventsAfterGrouping: number; oneOffCount: number; separateSessionCount: number; continuousCount: number; allDayCount: number; normalizedOccurrenceCount: number }
export type EdgeRejectedCandidateDebug = { canonicalUrl: string; titleLinkText: string; ancestorTagClassChain: string[]; nearbyTextPreview: string; containerOuterHtmlPreview: string; dateLikeTextNearby: string[]; structuredOrDataDate: boolean }
export type EdgeListPageParseStats = { requestUrl: string; status: number; htmlLength: number; dateHeadingCount: number; fjordNorwayEventLinkCount: number; candidateCardCount: number; parsedCardCount: number; rejectedMissingTitle: number; rejectedMissingDate: number; rejectedMissingSourceUrl: number; rejectedMissingDateSamples: EdgeRejectedCandidateDebug[] }


const CTA_LABELS = new Set(['book', 'read more', 'buy tickets', 'tickets', 'les mer', 'mehr erfahren'])
const FJORD_EVENT_LINK_RE = /<a\b[^>]+href=["'](?:[^"']*fjordnorway\.com\/[^"']*(?:events?|see-and-do|hva-skjer)|\/[^"']*(?:events?|see-and-do|hva-skjer))[^"']*["'][^>]*>[\s\S]*?<\/a>/gi

function isCtaLabel(value: string) { return CTA_LABELS.has(text(value).toLowerCase().trim()) }
function stripCtas(value: string) { return text(value).replace(/\b(Read more|Les mer|Mehr erfahren|Book|Buy tickets|Tickets)\b/ig, ' ').replace(/\s+/g, ' ').trim() }
function firstMatch(input: string, patterns: RegExp[]) { for (const re of patterns) { const m = input.match(re); if (m?.[0]) return m[0] } return '' }
function readMoreLink(card: string) {
  let firstEventLink: { tag: string; href: string } | null = null
  for (const m of card.matchAll(/<a\b[^>]+href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const href = attr(m[0], 'href')
    if (href && /(fjordnorway|edgeofnorway|\/en\/|event|hva-skjer|what|see-and-do)/i.test(href) && !firstEventLink) firstEventLink = { tag: m[0], href }
    const label = text(m[0]).toLowerCase().trim()
    if (/^(read more|les mer|mehr erfahren)\s*$/.test(label) || /\b(read more|les mer|mehr erfahren)\b/.test(label)) {
      if (href && /(fjordnorway|edgeofnorway|\/en\/|event|hva-skjer|what|see-and-do)/i.test(href)) return { tag: m[0], href }
    }
  }
  return firstEventLink
}
function titleFromCard(card: string, canonicalHref: string) {
  const heading = firstMatch(card, [/<h[2-4]\b[^>]*class=["'][^"']*(?:title|heading|name)[^"']*["'][^>]*>[\s\S]*?<\/h[2-4]>/i, /<h[2-4]\b[^>]*>[\s\S]*?<\/h[2-4]>/i])
  const headingTitle = stripCtas(heading)
  if (headingTitle && !parseDateHeading(headingTitle) && !isCtaLabel(headingTitle)) return headingTitle
  for (const m of card.matchAll(/<a\b[^>]+href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const href = attr(m[0], 'href')
    if (!href) continue
    const resolved = absUrl(href)
    if (resolved !== canonicalHref) continue
    const candidate = stripCtas(m[0])
    if (candidate && !isCtaLabel(candidate)) return candidate
  }
  return null
}
function cardTimeHtml(card: string) { return firstMatch(card, [/<time\b[^>]*>[\s\S]*?<\/time>/i, /<(?:span|div)\b[^>]*class=["'][^"']*(?:time|hour|date-time)[^"']*["'][^>]*>[\s\S]*?<\/(?:span|div)>/i]) }
function descriptionHtml(card: string) { return firstMatch(card, [/<(?:p|div)\b[^>]*class=["'][^"']*(?:description|summary|ingress|intro|teaser)[^"']*["'][^>]*>[\s\S]*?<\/(?:p|div)>/i]) }
function categoryHtml(card: string) { return firstMatch(card, [/<(?:span|div)\b[^>]*class=["'][^"']*(?:category|tag)[^"']*["'][^>]*>[\s\S]*?<\/(?:span|div)>/i]) }
function isDateGroupHeading(heading: string, referenceDate: Date) {
  const label = text(heading)
  return !!parseDateHeading(label, referenceDate) && /^\d{1,2}\.?\s+[A-Za-zæøåÆØÅ]+(?:\s+\d{4})?\.?$/.test(label)
}

const MONTHS: Record<string, number> = { january: 1, jan: 1, februar: 2, february: 2, feb: 2, march: 3, mars: 3, mar: 3, april: 4, apr: 4, may: 5, mai: 5, june: 6, juni: 6, jun: 6, july: 7, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, october: 10, oktober: 10, oct: 10, okt: 10, november: 11, nov: 11, december: 12, desember: 12, dec: 12, des: 12 }

function text(html: string) { return decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) }
function decode(s: string) { return s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&ndash;|&#8211;/g, '–').replace(/&mdash;|&#8212;/g, '—').replace(/&quot;/g, '"').replace(/&#39;/g, "'") }
function attr(tag: string, name: string) { return new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(tag)?.[1] || null }
function absUrl(href: string) { return new URL(decode(href), 'https://www.edgeofnorway.com').toString().split('#')[0] }
export function stableBaseEventId(canonicalUrl: string) { return crypto.createHash('sha256').update(canonicalUrl.trim().toLowerCase()).digest('hex').slice(0, 16) }
export function stableOccurrenceId(canonicalUrl: string, date: string, startTime: string | null) { return `${stableBaseEventId(canonicalUrl)}:${date}:${startTime || 'all-day'}` }

export function parseDateHeading(heading: string, referenceDate = new Date()) {
  const m = text(heading).toLowerCase().match(/\b(\d{1,2})\.?\s+([a-zæøå]+)(?:\s+(\d{4}))?\b/i)
  if (!m) return null
  const month = MONTHS[m[2]]
  if (!month) return null
  const refYear = referenceDate.getUTCFullYear(); const refMonth = referenceDate.getUTCMonth() + 1
  let year = m[3] ? Number(m[3]) : refYear
  if (!m[3] && refMonth === 12 && month === 1) year += 1
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
}

export function extractTime(input: string | null) {
  const s = text(input || '')
  const re = /(?:\bkl\.?\s*|\bklokken\s+|\bfrom\s+)?(\d{1,2})(?::|\.)(\d{2})(?:\s*[–—-]\s*(\d{1,2})(?::|\.)(\d{2}))?|(?:\bkl\.?\s*|\bklokken\s+)(\d{1,2})(?!\d)/i
  const m = s.match(re)
  if (!m) return { startTime: null, endTime: null }
  const h = Number(m[1] ?? m[5]); const min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return { startTime: null, endTime: null }
  const startTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  const endTime = m[3] ? `${String(Number(m[3])).padStart(2, '0')}:${String(Number(m[4])).padStart(2, '0')}` : null
  return { startTime, endTime }
}

function osloIso(date: string, time: string | null) { return `${date}T${time || '00:00'}:00+02:00` }
function classify(cards: ParsedEdgeCard[], detailHtml?: string): EdgeEventClassification {
  const dates = new Set(cards.map(c => c.date)); const body = text(detailHtml || cards.map(c => `${c.category || ''} ${c.shortDescription || ''}`).join(' ')).toLowerCase()
  if (/showings|performances|bookable|guided tour|workshop|session|omvisning|forestilling/.test(body) && dates.size <= 10) return 'separate_session'
  if (dates.size >= 4 || /exhibition|museum|installation|seasonal|display|utstilling|museum|åpent hver dag|open daily/.test(body)) return 'continuous'
  return 'one_off'
}

function balancedContainerAround(html: string, index: number) {
  for (const tag of ['article', 'li']) {
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
    let open: RegExpExecArray | null
    let best: RegExpExecArray | null = null
    while ((open = openRe.exec(html)) && open.index <= index) best = open
    if (!best) continue
    const close = html.indexOf(`</${tag}>`, index)
    if (close > index) return html.slice(best.index, close + tag.length + 3)
  }
  const eventDivRe = /<div\b[^>]*class=["'][^"']*(?:event-list-item|event-card|product-list-item|search-result-card|(?:^|\s)card(?:\s|$))[^"']*["'][^>]*>/gi
  let eventDiv: RegExpExecArray | null
  let bestEventDiv: RegExpExecArray | null = null
  while ((eventDiv = eventDivRe.exec(html)) && eventDiv.index <= index) bestEventDiv = eventDiv
  if (bestEventDiv) {
    eventDivRe.lastIndex = index + 1
    const nextEventDiv = eventDivRe.exec(html)?.index ?? html.length
    const nextHeading = html.slice(index).search(/<h[1-4]\b/i)
    const end = Math.min(nextEventDiv, nextHeading >= 0 ? index + nextHeading : html.length)
    return html.slice(bestEventDiv.index, end)
  }
  for (const tag of ['div', 'section']) {
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
    let open: RegExpExecArray | null
    let best: RegExpExecArray | null = null
    while ((open = openRe.exec(html)) && open.index <= index) best = open
    if (!best) continue
    const close = html.indexOf(`</${tag}>`, index)
    if (close > index) return html.slice(best.index, close + tag.length + 3)
  }
  return html.slice(Math.max(0, index - 1200), Math.min(html.length, index + 1800))
}

function explicitDateFromCard(card: string, referenceDate: Date) {
  for (const m of card.matchAll(/<[^>]+(?:class|itemprop|property|data-testid|aria-label)=["'][^"']*(?:date|time|when|calendar|day|startDate)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi)) {
    const date = parseDateHeading(m[0], referenceDate)
    if (date) return date
    const datetime = attr(m[0], 'datetime') || attr(m[0], 'content') || attr(m[0], 'data-date') || attr(m[0], 'data-start-date')
    const isoDate = datetime?.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
    if (isoDate) return isoDate
  }
  for (const m of card.matchAll(/\b(?:datetime|content|data-date|data-start-date|startDate)=["']([^"']+)["']/gi)) {
    const isoDate = m[1].match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
    if (isoDate) return isoDate
    const date = parseDateHeading(m[1], referenceDate)
    if (date) return date
  }
  return null
}

function nearestDateGroupBefore(html: string, linkIndex: number, referenceDate: Date) {
  const before = html.slice(0, linkIndex)
  const headings = [...before.matchAll(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<[^>]+class=["'][^"']*(?:date|day|heading|group)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi)]
  for (const match of headings.reverse()) {
    const date = parseDateHeading(match[0], referenceDate)
    if (date) return date
  }
  return null
}

function nearestDateForLink(html: string, container: string, linkIndex: number, referenceDate: Date) {
  return explicitDateFromCard(container, referenceDate) || nearestDateGroupBefore(html, linkIndex, referenceDate)
}

function ancestorTagClassChain(html: string, index: number) {
  const chain: string[] = []
  for (const m of html.slice(0, index).matchAll(/<\/?([a-z0-9-]+)\b([^>]*)>/gi)) {
    if (m[0].startsWith('</')) chain.pop()
    else chain.push(`${m[1].toLowerCase()}${attr(m[0], 'class') ? `.${attr(m[0], 'class')}` : ''}`)
  }
  return chain.slice(-8)
}

function rejectedCandidateDebug(html: string, link: { tag: string; href: string; index: number }, container: string): EdgeRejectedCandidateDebug {
  const nearby = html.slice(Math.max(0, link.index - 900), Math.min(html.length, link.index + 1400))
  return {
    canonicalUrl: absUrl(link.href),
    titleLinkText: stripCtas(link.tag),
    ancestorTagClassChain: ancestorTagClassChain(html, link.index),
    nearbyTextPreview: text(nearby).slice(0, 600),
    containerOuterHtmlPreview: container.replace(/\s+/g, ' ').trim().slice(0, 900),
    dateLikeTextNearby: [...new Set([...nearby.matchAll(/\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\.?\s+[A-Za-zæøåÆØÅ]+(?:\s+\d{4})?)\b/g)].map((m) => m[0]))].slice(0, 8),
    structuredOrDataDate: /\b(?:datetime|content|data-date|data-start-date|startDate)=["'][^"']*(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\.?\s+[A-Za-zæøåÆØÅ]+)/i.test(container),
  }
}

function eventTitleLinks(html: string) {
  const links: Array<{ tag: string; href: string; index: number }> = []
  for (const m of html.matchAll(FJORD_EVENT_LINK_RE)) {
    const href = attr(m[0], 'href')
    if (!href) continue
    const label = stripCtas(m[0])
    if (!label || isCtaLabel(label)) continue
    links.push({ tag: m[0], href, index: m.index ?? 0 })
  }
  return links
}

export function parseEdgeOfNorwayListPageWithStats(html: string, sourcePlace: EdgeOfNorwayCity, opts: { referenceDate?: Date; requestUrl?: string; status?: number } = {}) {
  const referenceDate = opts.referenceDate || new Date()
  const cards: ParsedEdgeCard[] = []
  const stats: EdgeListPageParseStats = { requestUrl: opts.requestUrl || '', status: opts.status || 0, htmlLength: html.length, dateHeadingCount: 0, fjordNorwayEventLinkCount: [...html.matchAll(FJORD_EVENT_LINK_RE)].length, candidateCardCount: 0, parsedCardCount: 0, rejectedMissingTitle: 0, rejectedMissingDate: 0, rejectedMissingSourceUrl: 0, rejectedMissingDateSamples: [] }
  const dateHeadings = [...html.matchAll(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi)].filter((m) => isDateGroupHeading(m[0], referenceDate))
  stats.dateHeadingCount = dateHeadings.length

  const links = eventTitleLinks(html)
  stats.candidateCardCount = links.length
  for (const link of links) {
    const canonicalUrl = absUrl(link.href)
    if (!canonicalUrl) { stats.rejectedMissingSourceUrl += 1; continue }
    const container = balancedContainerAround(html, link.index)
    const currentDate = nearestDateForLink(html, container, link.index, referenceDate)
    if (!currentDate) {
      stats.rejectedMissingDate += 1
      if (stats.rejectedMissingDateSamples.length < 3) stats.rejectedMissingDateSamples.push(rejectedCandidateDebug(html, link, container))
      continue
    }
    const title = stripCtas(link.tag) || titleFromCard(container, canonicalUrl)
    if (!title || title.length < 2 || isCtaLabel(title)) { stats.rejectedMissingTitle += 1; continue }
    let { startTime, endTime } = extractTime(cardTimeHtml(container)); let timeSource: TimeSource = startTime ? 'card' : 'all_day'
    const shortDescription = text(descriptionHtml(container).slice(0, 500)) || null
    if (!startTime) { const t = extractTime(shortDescription || container); startTime = t.startTime; endTime = t.endTime; if (startTime) timeSource = shortDescription ? 'description' : 'card' }
    const category = text(categoryHtml(container)) || null
    cards.push({ title, date: currentDate, startTime, endTime, allDay: !startTime, canonicalUrl, sourcePlace, category, shortDescription, timeSource })
  }
  const dedupedCards = [...new Map(cards.map(c => [`${c.canonicalUrl}:${c.date}:${c.startTime || 'all-day'}`, c])).values()]
  stats.parsedCardCount = dedupedCards.length
  return { cards: dedupedCards, stats }
}


export function parseEdgeOfNorwayListPage(html: string, sourcePlace: EdgeOfNorwayCity, referenceDate = new Date()): ParsedEdgeCard[] {
  return parseEdgeOfNorwayListPageWithStats(html, sourcePlace, { referenceDate }).cards
}

export function mergeRegionalEvents(cards: ParsedEdgeCard[], details: Record<string, string> = {}): { occurrences: NormalizedEdgeOccurrence[]; stats: MergeStats } {
  const byUrl = new Map<string, ParsedEdgeCard[]>(); for (const c of cards) byUrl.set(c.canonicalUrl, [...(byUrl.get(c.canonicalUrl) || []), c])
  const occurrences: NormalizedEdgeOccurrence[] = []
  for (const [url, group] of byUrl) {
    const classification = classify(group, details[url]); const baseEventId = stableBaseEventId(url); const dates = group.map(g => g.date).sort(); const places = [...new Set(group.map(g => g.sourcePlace))]
    if (classification === 'continuous') {
      const first = group.find(g => g.startTime) || group[0]
      occurrences.push({ baseEventId, occurrenceId: `${baseEventId}:${dates[0]}:${dates.at(-1)}:continuous`, provider: EDGE_OF_NORWAY_PROVIDER_ID, title: first.title, date: dates[0], endDate: dates.at(-1) || dates[0], startTime: null, endTime: null, startsAt: osloIso(dates[0], null), endsAt: osloIso(dates.at(-1) || dates[0], '23:59'), allDay: true, canonicalUrl: url, classification, sourcePlaces: places })
    } else {
      for (const g of new Map(group.map(x => [`${x.date}:${x.startTime || 'all-day'}`, x])).values()) occurrences.push({ baseEventId, occurrenceId: stableOccurrenceId(url, g.date, g.startTime), provider: EDGE_OF_NORWAY_PROVIDER_ID, title: g.title, date: g.date, endDate: null, startTime: g.startTime, endTime: g.endTime, startsAt: osloIso(g.date, g.startTime), endsAt: g.endTime ? osloIso(g.date, g.endTime) : null, allDay: !g.startTime, canonicalUrl: url, classification, sourcePlaces: places })
    }
  }
  const stats = { cardsParsedBySource: cards.reduce((a,c)=>({ ...a, [c.sourcePlace]:(a[c.sourcePlace]||0)+1 }), {} as Record<string,number>), duplicatesRemoved: cards.length - occurrences.length, uniqueEventsAfterGrouping: byUrl.size, oneOffCount: occurrences.filter(o=>o.classification==='one_off').length, separateSessionCount: occurrences.filter(o=>o.classification==='separate_session').length, continuousCount: occurrences.filter(o=>o.classification==='continuous').length, allDayCount: occurrences.filter(o=>o.allDay).length, normalizedOccurrenceCount: occurrences.length }
  return { occurrences, stats }
}


export function parseEdgeOfNorwayDetailPage(html: string, canonicalUrl: string, fallbackDate: string) {
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || canonicalUrl
  const body = text(html)
  const found = [...body.matchAll(/(\d{1,2}\s+[A-Za-zæøåÆØÅ]+)[^\d]{0,40}(?:kl\.?\s*|klokken\s+|from\s+)?(\d{1,2})(?::|\.)(\d{2})/g)]
  const showings = found.map((m) => {
    const date = parseDateHeading(m[1], new Date(`${fallbackDate}T00:00:00Z`)) || fallbackDate
    const startTime = `${String(Number(m[2])).padStart(2, '0')}:${String(Number(m[3])).padStart(2, '0')}`
    return { date, startTime, startsAt: osloIso(date, startTime) }
  })
  if (!showings.length) {
    const time = extractTime(body)
    if (time.startTime) showings.push({ date: fallbackDate, startTime: time.startTime, startsAt: osloIso(fallbackDate, time.startTime) })
  }
  return { canonicalUrl: absUrl(canonical), showings, classificationHint: classify([], html) }
}

export async function fetchEdgeOfNorwaySourcePage(url: string, fetchImpl = fetch) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000)
  try { const resp = await fetchImpl(url, { headers: { 'User-Agent': EDGE_OF_NORWAY_USER_AGENT }, signal: controller.signal }); return { status: resp.status, html: await resp.text() } } finally { clearTimeout(timeout) }
}
