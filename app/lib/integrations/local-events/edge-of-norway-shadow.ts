export const EDGE_OF_NORWAY_PROVIDER = 'edge-of-norway' as const
export const EDGE_OF_NORWAY_MODE = 'shadow' as const
export const EDGE_OF_NORWAY_STAVANGER_LIST_URL = 'https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=stavanger'
export const EDGE_OF_NORWAY_USER_AGENT = 'RE:MIND local-events shadow diagnostics (no persistence; contact hello@remind.no)'
export const EDGE_OF_NORWAY_DEFAULT_REFERENCE_DATE = '2026-07-12'

export type EdgeOfNorwaySkipReason =
  | 'multiple_dates'
  | 'recurring_event'
  | 'exhibition_or_continuous'
  | 'unclear_date'
  | 'missing_badge_date'
  | 'missing_title'
  | 'missing_source_url'
  | 'fetch_failed'

export type EdgeOfNorwayAcceptedEvent = {
  title: string
  sourceUrl: string
  date: string
  startTime: string | null
  allDay: boolean
}

type EdgeOfNorwayCardParseResult =
  | { accepted: true; event: EdgeOfNorwayAcceptedEvent }
  | { accepted: false; reason: EdgeOfNorwaySkipReason; title?: string; sourceUrl?: string }

export type EdgeOfNorwayDiagnosticResult = {
  provider: typeof EDGE_OF_NORWAY_PROVIDER
  mode: typeof EDGE_OF_NORWAY_MODE
  listPageUrl: string
  cardsDiscovered: number
  exactDuplicateCardsRemoved: number
  uniqueSourceUrls: number
  acceptedCount: number
  skippedCounts: Record<string, number>
  acceptedEvents: EdgeOfNorwayAcceptedEvent[]
  parsingErrors: Array<{ title?: string; sourceUrl?: string; reason: string }>
  cardRoots?: Array<{ tagName: string; className?: string }>
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))
  return m ? decodeEntities(m[1]) : null
}

function canonicalizeFjordNorwayUrl(href: string, pageUrl: string) {
  try {
    const url = new URL(decodeEntities(href), pageUrl)
    if (url.hostname !== 'www.fjordnorway.com') return null
    if (!/^\/en\/events\/[a-z0-9][a-z0-9-]*\/?$/i.test(url.pathname)) return null
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/$/, '')
    return url.toString()
  } catch {
    return null
  }
}

function isVoidTag(tagName: string) {
  return ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tagName)
}
type HtmlNode = { tagName: string; start: number; openEnd: number; end: number; parent: number | null; html: string }
type CardContainer = { html: string; sourceUrl: string; rootTagName: string; rootClassName?: string }

function parseHtmlNodes(html: string) {
  const nodes: HtmlNode[] = []
  const stack: number[] = []
  const tagRe = /<\/?\s*([a-z0-9-]+)\b[^>]*>/gi
  for (const match of html.matchAll(tagRe)) {
    const raw = match[0]
    const name = match[1].toLowerCase()
    const index = Number(match.index)
    if (/^<\s*\//.test(raw)) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const nodeIndex = stack[i]
        if (nodes[nodeIndex].tagName !== name) continue
        nodes[nodeIndex].end = index + raw.length
        stack.splice(i)
        break
      }
      continue
    }
    const node: HtmlNode = { tagName: name, start: index, openEnd: index + raw.length, end: index + raw.length, parent: stack.at(-1) ?? null, html: '' }
    const nodeIndex = nodes.push(node) - 1
    if (!isVoidTag(name) && !/\/\s*>$/.test(raw)) stack.push(nodeIndex)
  }
  for (const node of nodes) {
    if (node.end <= node.openEnd) node.end = html.length
    node.html = html.slice(node.start, node.end)
  }
  return nodes
}

function openingTagOfNode(node: HtmlNode) {
  return node.html.match(/^<[^>]*>/)?.[0] || ''
}

function extractHeadingTitle(card: string) {
  const headings = Array.from(card.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi))
    .map((m) => stripTags(m[1]))
    .filter(Boolean)
    .filter((text) => !/^read\s*more\b/i.test(text))
  return headings.length === 1 ? headings[0] : null
}

function hasDateBadge(card: string, referenceDate: Date | string) {
  return extractBadgeDates(card, referenceDate).length > 0
}

function findCardContainers(html: string, pageUrl: string, referenceDate: Date | string): CardContainer[] {
  const nodes = parseHtmlNodes(html)
  const containers: CardContainer[] = []
  const seenRoots = new Set<string>()

  for (const linkNode of nodes.filter((node) => node.tagName === 'a')) {
    const linkHtml = linkNode.html
    if (!/\bread\s*more\b/i.test(stripTags(linkHtml))) continue
    const sourceUrl = canonicalizeFjordNorwayUrl(attr(openingTagOfNode(linkNode), 'href') || '', pageUrl) || undefined

    let parent = linkNode.parent
    let fallback: HtmlNode | null = null
    while (parent !== null) {
      const ancestor = nodes[parent]
      const candidateHtml = ancestor.html
      const readMoreUrl = extractReadMoreUrl(candidateHtml, pageUrl)
      const hasSameReadMore = sourceUrl ? readMoreUrl === sourceUrl : /\bread\s*more\b/i.test(stripTags(linkHtml))
      const title = extractHeadingTitle(candidateHtml)
      const date = hasDateBadge(candidateHtml, referenceDate)
      if (hasSameReadMore && (title || date) && !fallback) fallback = ancestor
      if (hasSameReadMore && title && date) {
        fallback = ancestor
        break
      }
      parent = ancestor.parent
    }
    if (fallback) {
      const key = `${fallback.start}:${fallback.end}`
      if (!seenRoots.has(key)) {
        seenRoots.add(key)
        const openingTag = openingTagOfNode(fallback)
        containers.push({ html: fallback.html, sourceUrl: sourceUrl || '', rootTagName: fallback.tagName, rootClassName: attr(openingTag, 'class') || undefined })
      }
    }
  }
  return containers
}

function sanitizeOuterHtml(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '<script>[removed]</script>')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '<style>[removed]</style>')
    .replace(/\s+/g, ' ')
    .slice(0, 1800)
}

const monthMap: Record<string, number> = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, mai: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12 }

function normalizeReferenceDate(referenceDate: Date | string) {
  if (referenceDate instanceof Date) return referenceDate.toISOString().slice(0, 10)
  return referenceDate.slice(0, 10)
}

function parseBadgeDateText(value: string, referenceDate: Date | string) {
  const m = value.match(/\b(\d{1,2})\.?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|mai|jun(?:e|i)?|jul(?:y|i)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\b/i)
  if (!m) return null
  const day = Number(m[1])
  const month = monthMap[m[2].toLowerCase().replace(/\.$/, '')]
  if (!month || day < 1 || day > 31) return null
  const ref = normalizeReferenceDate(referenceDate)
  const refYear = Number(ref.slice(0, 4))
  const refMonth = Number(ref.slice(5, 7))
  const year = month < refMonth - 6 ? refYear + 1 : refYear
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseTime(value: string) {
  const m = value.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

function extractReadMoreUrl(card: string, pageUrl: string) {
  for (const m of card.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>(?:(?!<a\b)[\s\S])*?read\s*more(?:(?!<a\b)[\s\S])*?<\/a>/gi)) {
    const tag = m[0].match(/^<a\b[^>]*>/i)?.[0] || ''
    const canonical = canonicalizeFjordNorwayUrl(attr(tag, 'href') || '', pageUrl)
    if (canonical) return canonical
  }
  return null
}

function extractTitle(card: string, _sourceUrl: string, _pageUrl: string) {
  return extractHeadingTitle(card)
}

function extractBadgeDates(card: string, referenceDate: Date | string) {
  const badgeMatches = Array.from(card.matchAll(/<(?:div|span|time|p)\b[^>]*(?:class=["'][^"']*(?:date|badge|calendar|yellow)[^"']*["']|data-(?:date|badge)[^=>]*)(?:[^>]*)>[\s\S]*?<\/(?:div|span|time|p)>/gi))
    .map((m) => parseBadgeDateText(stripTags(m[0]), referenceDate))
    .filter(Boolean) as string[]
  return Array.from(new Set(badgeMatches))
}

function extractClockTime(card: string) {
  for (const m of card.matchAll(/<(?:div|span|time|p)\b[^>]*(?:class=["'][^"']*(?:clock|time)[^"']*["']|data-(?:clock|time)[^=>]*)(?:[^>]*)>[\s\S]*?<\/(?:div|span|time|p)>/gi)) {
    const time = parseTime(stripTags(m[0]))
    if (time) return time
  }
  return null
}

function parseCard(card: string, pageUrl: string, referenceDate: Date | string): EdgeOfNorwayCardParseResult {
  const sourceUrl = extractReadMoreUrl(card, pageUrl) || undefined
  const title = sourceUrl ? extractTitle(card, sourceUrl, pageUrl) || undefined : undefined
  if (!sourceUrl) return { accepted: false, reason: 'missing_source_url', title: stripTags(card.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] || '') || undefined }
  if (!title) return { accepted: false, reason: 'missing_title', sourceUrl }
  const dates = extractBadgeDates(card, referenceDate)
  if (dates.length === 0) return { accepted: false, reason: 'missing_badge_date', title, sourceUrl }
  if (dates.length > 1) return { accepted: false, reason: 'multiple_dates', title, sourceUrl }
  const text = stripTags(card)
  if (/\b(exhibition|exhibited|continuous|ongoing)\b/i.test(text)) return { accepted: false, reason: 'exhibition_or_continuous', title, sourceUrl }
  if (/\b(recurring|every\s+(day|week|month)|weekly|daily)\b/i.test(text)) return { accepted: false, reason: 'recurring_event', title, sourceUrl }
  const time = extractClockTime(card)
  return { accepted: true, event: { title, sourceUrl, date: dates[0], startTime: time, allDay: !time } }
}

export function parseEdgeOfNorwayListPage(html: string, pageUrl = EDGE_OF_NORWAY_STAVANGER_LIST_URL, referenceDate: Date | string = EDGE_OF_NORWAY_DEFAULT_REFERENCE_DATE) {
  const cardContainers = findCardContainers(html, pageUrl, referenceDate)
  const cardResults = cardContainers.map((card) => parseCard(card.html, pageUrl, referenceDate))
  if (process.env.NODE_ENV === 'development') {
    cardResults.forEach((result, index) => {
      if (!result.accepted && cardResults.slice(0, index).filter((previous) => !previous.accepted).length < 3) {
        console.debug('[edge-of-norway] failed candidate outerHTML', { reason: result.reason, sourceUrl: result.sourceUrl, outerHTML: sanitizeOuterHtml(cardContainers[index]?.html || '') })
      }
    })
  }
  const exactSeen = new Set<string>()
  const deduped: EdgeOfNorwayCardParseResult[] = []
  let exactDuplicateCardsRemoved = 0
  for (const result of cardResults) {
    if (result.accepted) {
      const key = `${result.event.sourceUrl}|${result.event.date}|${result.event.startTime || ''}`
      if (exactSeen.has(key)) { exactDuplicateCardsRemoved += 1; continue }
      exactSeen.add(key)
    }
    deduped.push(result)
  }
  const accepted = deduped.filter((r): r is { accepted: true; event: EdgeOfNorwayAcceptedEvent } => r.accepted)
  const urlsWithDates = new Map<string, Set<string>>()
  for (const r of accepted) {
    const dates = urlsWithDates.get(r.event.sourceUrl) || new Set<string>()
    dates.add(r.event.date)
    urlsWithDates.set(r.event.sourceUrl, dates)
  }
  const multiUrl = new Set(Array.from(urlsWithDates).filter(([, dates]) => dates.size > 1).map(([url]) => url))
  const finalResults = deduped.map((r) => r.accepted && multiUrl.has(r.event.sourceUrl) ? { accepted: false as const, reason: 'multiple_dates' as const, title: r.event.title, sourceUrl: r.event.sourceUrl } : r)
  return { cardsDiscovered: cardResults.length, exactDuplicateCardsRemoved, results: finalResults, cardRoots: cardContainers.map((card) => ({ tagName: card.rootTagName, className: card.rootClassName })) }
}

export async function runEdgeOfNorwayShadowDiagnostic(fetchImpl = fetch, referenceDate: Date | string = EDGE_OF_NORWAY_DEFAULT_REFERENCE_DATE): Promise<EdgeOfNorwayDiagnosticResult> {
  const skippedCounts: Record<string, number> = {}
  const acceptedEvents: EdgeOfNorwayAcceptedEvent[] = []
  const parsingErrors: Array<{ title?: string; sourceUrl?: string; reason: string }> = []
  const listResp = await fetchImpl(EDGE_OF_NORWAY_STAVANGER_LIST_URL, { headers: { 'user-agent': EDGE_OF_NORWAY_USER_AGENT } })
  if (!listResp.ok) throw new Error(`Failed to fetch list page: ${listResp.status}`)
  const parsed = parseEdgeOfNorwayListPage(await listResp.text(), EDGE_OF_NORWAY_STAVANGER_LIST_URL, referenceDate)
  for (const result of parsed.results) {
    if (result.accepted) acceptedEvents.push(result.event)
    else { skippedCounts[result.reason] = (skippedCounts[result.reason] || 0) + 1; parsingErrors.push({ title: result.title, sourceUrl: result.sourceUrl, reason: result.reason }) }
  }
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_STAVANGER_LIST_URL, cardsDiscovered: parsed.cardsDiscovered, exactDuplicateCardsRemoved: parsed.exactDuplicateCardsRemoved, uniqueSourceUrls: new Set(acceptedEvents.map((e) => e.sourceUrl).concat(parsingErrors.map((e) => e.sourceUrl || '').filter(Boolean))).size, acceptedCount: acceptedEvents.length, skippedCounts, acceptedEvents, parsingErrors: parsingErrors.slice(0, 10), cardRoots: parsed.cardRoots }
}
