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
  | 'timeout'
  | 'parser_failed'
  | 'unclear_time'
  | 'multiple_times'

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
  validCardsParsed: number
  acceptedCount: number
  skippedCounts: Record<string, number>
  acceptedEvents: EdgeOfNorwayAcceptedEvent[]
  parsingErrors: Array<{ title?: string; sourceUrl?: string; reason: string }>
  eventAnchorsDiscovered?: number
  readMoreAnchorsDiscovered?: number
  occurrencesResolved?: number
  rawCardsParsed?: number
  titleAnchorsFound?: number
  occurrenceListItemsResolved?: number
  uniqueCardNodes?: number
  rawOccurrencesParsed?: number
  rawSegmentsCreated?: number
  cardsMissingBadge?: number
  cardsMissingReadMore?: number
  cardsContainingOtherEvent?: number
  urlGroupsWithTitleAndReadMore?: number
  cardsWithOneBadgeDate?: number
  cardsWithTime?: number
  cardsWithoutTime?: number
  cardRoots?: Array<{ tagName: string; className?: string }>
  rawCards?: EdgeOfNorwayRawCard[]
  missingRawFields?: Array<{ index: number; titleMissing: boolean; badgeMissing: boolean; sourceUrlMissing: boolean }>
  error?: string
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
type AnchorInfo = { nodeIndex: number; html: string; text: string; url: string; isReadMore: boolean; isTitle: boolean; start: number; end: number }
type CardContainer = { html: string; sourceUrl: string; title: string | null; rootTagName: string; rootClassName?: string; start: number; end: number; readMoreStart: number; titleStart: number | null; badgeText: string | null; date: string | null; timeText: string | null; skipReason?: EdgeOfNorwaySkipReason | 'multiple_times' }
type DiscoveryFailure = { reason: EdgeOfNorwaySkipReason | 'multiple_times'; sourceUrl?: string; title?: string }
export type EdgeOfNorwayRawCard = { title: string | null; badgeText: string | null; date?: string | null; timeText: string | null; startTime?: string | null; allDay?: boolean; sourceUrl: string | null }

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

export const EDGE_OF_NORWAY_CARD_WRAPPER_SELECTOR = 'ordered-read-more-segment'
const EDGE_OF_NORWAY_INSPECTION_TITLE = 'Uncovering the Secrets of Stavanger Cathedral by the Museum of Archaeology'

export type EdgeOfNorwayCardHierarchyInspection = Array<{
  level: number
  tagName: string
  className: string
  containsTitle: boolean
  containsBadgeText: boolean
  containsMatchingReadMoreLink: boolean
  containsAnotherEventTitle: boolean
}>

function textWithoutAnchorsScriptsStyles(html: string) {
  return stripTags(html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' '))
}

function eventAnchors(nodes: HtmlNode[], pageUrl: string): AnchorInfo[] {
  return nodes.map((node, nodeIndex) => ({ node, nodeIndex })).filter(({ node }) => node.tagName === 'a').map(({ node, nodeIndex }) => {
    const opening = openingTagOfNode(node)
    const url = canonicalizeFjordNorwayUrl(attr(opening, 'href') || '', pageUrl)
    if (!url) return null
    const text = stripTags(node.html)
    const normalized = text.replace(/\s+/g, ' ').trim()
    const isReadMore = /^read\s*more\b/i.test(normalized)
    const isImageOnly = /<img\b/i.test(node.html) && !normalized
    const isTitle = Boolean(normalized) && !isReadMore && !/^book\b/i.test(normalized) && !isImageOnly
    return { nodeIndex, html: node.html, text: normalized, url, isReadMore, isTitle, start: node.start, end: node.end }
  }).filter(Boolean) as AnchorInfo[]
}

function countEventTitleLinks(card: string, pageUrl: string) {
  const urls = new Set<string>()
  let count = 0
  for (const m of card.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>(?:(?!<a\b)[\s\S])*?<\/a>/gi)) {
    const tag = m[0].match(/^<a\b[^>]*>/i)?.[0] || ''
    const canonical = canonicalizeFjordNorwayUrl(attr(tag, 'href') || '', pageUrl)
    const text = stripTags(m[0])
    if (!canonical || /^read\s*more\b/i.test(text) || /^book\b/i.test(text) || !text) continue
    urls.add(canonical)
    count += 1
  }
  return { count, urls }
}

const badgeDatePattern = /^\d{1,2}\.\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|mai|jun(?:e|i)?|jul(?:y|i)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\.)?$/i
const badgeDateGlobalPattern = /\b\d{1,2}\.\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|mai|jun(?:e|i)?|jul(?:y|i)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\.)?(?=\s|$|<)/gi
const standaloneTimePattern = /^([01]?\d|2[0-3]):([0-5]\d)$/
const standaloneTimeGlobalPattern = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g

function leafTextsMatching(nodes: HtmlNode[], rootIndex: number, pattern: RegExp) {
  const root = nodes[rootIndex]
  const matches: string[] = []
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node.start < root.start || node.end > root.end) continue
    const text = textWithoutAnchorsScriptsStyles(node.html).replace(/\s+/g, ' ').trim()
    if (pattern.test(text)) matches.push(text)
  }
  return Array.from(new Set(matches))
}

function visibleTextMatchesBefore(html: string, absoluteSegmentStart: number, absoluteEnd: number, pattern: RegExp) {
  const relEnd = Math.max(0, absoluteEnd - absoluteSegmentStart)
  const part = html.slice(0, relEnd).replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ')
  return Array.from(part.matchAll(pattern)).map((m) => ({ text: m[0].replace(/\s+/g, ' ').trim(), start: absoluteSegmentStart + Number(m.index) }))
}

function findEventResultsStart(html: string) {
  const main = html.search(/<main\b/i)
  return main >= 0 ? main : 0
}

function findCardContainers(html: string, pageUrl: string, referenceDate: Date | string) {
  const nodes = parseHtmlNodes(html)
  const anchors = eventAnchors(nodes, pageUrl)
  const readMoreAnchors = anchors.filter((anchor) => anchor.isReadMore).sort((a, b) => a.start - b.start)
  const uniqueUrls = new Set(anchors.map((anchor) => anchor.url))
  const failures: DiscoveryFailure[] = []
  const containers: CardContainer[] = []
  let previousReadMoreEnd = findEventResultsStart(html)

  for (const readMoreAnchor of readMoreAnchors) {
    const segmentStart = previousReadMoreEnd
    const segmentEnd = readMoreAnchor.end
    const segmentHtml = html.slice(segmentStart, segmentEnd)
    const segmentAnchors = anchors.filter((anchor) => anchor.start >= segmentStart && anchor.end <= segmentEnd)
    const titleAnchor = segmentAnchors.filter((anchor) => anchor.start < readMoreAnchor.start && anchor.url === readMoreAnchor.url && anchor.isTitle).at(-1) || null
    const times = Array.from(stripTags(segmentHtml.slice(Math.max(0, (titleAnchor?.end ?? segmentStart) - segmentStart), readMoreAnchor.start - segmentStart)).matchAll(standaloneTimeGlobalPattern)).map((m) => `${m[1].padStart(2, '0')}:${m[2]}`)
    const uniqueTimes = Array.from(new Set(times))
    const badgeCandidates = titleAnchor ? visibleTextMatchesBefore(segmentHtml, segmentStart, titleAnchor.start, badgeDateGlobalPattern) : []
    const badgeText = badgeCandidates.at(-1)?.text || null
    const date = badgeText ? parseBadgeDateText(badgeText, referenceDate) : null
    let skipReason: CardContainer['skipReason']
    if (!titleAnchor) skipReason = 'missing_title'
    else if (!badgeText) skipReason = 'missing_badge_date'
    else if (!date) skipReason = 'unclear_date'
    else if (uniqueTimes.length > 1) skipReason = 'multiple_times'
    if (skipReason) failures.push({ reason: skipReason, sourceUrl: readMoreAnchor.url, title: titleAnchor?.text })
    containers.push({ html: segmentHtml, sourceUrl: readMoreAnchor.url, title: titleAnchor?.text || null, rootTagName: 'segment', start: segmentStart, end: segmentEnd, readMoreStart: readMoreAnchor.start, titleStart: titleAnchor?.start ?? null, badgeText, date, timeText: uniqueTimes.length === 1 ? uniqueTimes[0] : null, skipReason })
    previousReadMoreEnd = readMoreAnchor.end
  }

  return { containers, failures, eventAnchorsDiscovered: anchors.length, readMoreAnchorsDiscovered: readMoreAnchors.length, titleAnchorsFound: anchors.filter((anchor) => anchor.isTitle).length, uniqueEventUrls: uniqueUrls.size, urlGroupsWithTitleAndReadMore: 0 }
}

export function inspectEdgeOfNorwayCardHierarchy(html: string, pageUrl = EDGE_OF_NORWAY_STAVANGER_LIST_URL): EdgeOfNorwayCardHierarchyInspection {
  const titleIndex = html.indexOf(EDGE_OF_NORWAY_INSPECTION_TITLE)
  if (titleIndex < 0) return []
  const nodes = parseHtmlNodes(html)
  const titleNodeIndex = nodes.findIndex((node) => node.start <= titleIndex && titleIndex < node.end && /h[1-6]|a/i.test(node.tagName))
  const hierarchy: EdgeOfNorwayCardHierarchyInspection = []
  let current = titleNodeIndex >= 0 ? nodes[titleNodeIndex].parent : nodes.findLastIndex((node) => node.start <= titleIndex && titleIndex < node.end)
  const matchingTitleUrl = current != null && current >= 0 ? Array.from(countEventTitleLinks(nodes[current].html, pageUrl).urls)[0] : null
  for (let level = 0; current != null && current >= 0 && level < 8; level += 1) {
    const node = nodes[current]
    const openingTag = openingTagOfNode(node)
    const titleLinks = countEventTitleLinks(node.html, pageUrl)
    const readMoreUrl = extractReadMoreUrl(node.html, pageUrl)
    hierarchy.push({
      level,
      tagName: node.tagName,
      className: attr(openingTag, 'class') || '',
      containsTitle: node.html.includes(EDGE_OF_NORWAY_INSPECTION_TITLE),
      containsBadgeText: stripTags(node.html).includes('12. Jul.'),
      containsMatchingReadMoreLink: Boolean(readMoreUrl && (!matchingTitleUrl || readMoreUrl === matchingTitleUrl)),
      containsAnotherEventTitle: titleLinks.count > 1,
    })
    current = node.parent
  }
  return hierarchy
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

function exactRawCardKey(card: EdgeOfNorwayRawCard) {
  return JSON.stringify([card.title, card.badgeText, card.timeText, card.sourceUrl])
}

function extractReadMoreUrl(card: string, pageUrl: string) {
  for (const m of card.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>(?:(?!<a\b)[\s\S])*?read\s*more(?:(?!<a\b)[\s\S])*?<\/a>/gi)) {
    const tag = m[0].match(/^<a\b[^>]*>/i)?.[0] || ''
    const canonical = canonicalizeFjordNorwayUrl(attr(tag, 'href') || '', pageUrl)
    if (canonical) return canonical
  }
  return null
}

function extractTitle(card: string, sourceUrl: string, pageUrl: string) {
  for (const m of card.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>(?:(?!<a\b)[\s\S])*?<\/a>/gi)) {
    const tag = m[0].match(/^<a\b[^>]*>/i)?.[0] || ''
    const canonical = canonicalizeFjordNorwayUrl(attr(tag, 'href') || '', pageUrl)
    const text = stripTags(m[0])
    if (canonical === sourceUrl && text && !/^read\s*more\b/i.test(text) && !/^book\b/i.test(text)) return text
  }
  return extractHeadingTitle(card)
}

function extractBadgeDates(card: string, referenceDate: Date | string) {
  const badgeMatches = badgeTextsInCard(card).map((text) => parseBadgeDateText(text, referenceDate)).filter(Boolean) as string[]
  return Array.from(new Set(badgeMatches))
}

function extractClockTime(card: string) {
  const times = standaloneTimeTextsInCard(card)
  return times.length === 1 ? times[0] : null
}

function extractRawTitle(card: string, sourceUrl: string | null, pageUrl: string) {
  return sourceUrl ? extractTitle(card, sourceUrl, pageUrl) : extractHeadingTitle(card)
}

function extractRawBadgeText(card: string) {
  return countBadgeTexts(card)[0] || null
}

function extractRawTimeText(card: string) {
  return parseTime(textWithoutAnchorsScriptsStyles(card))
}

function standaloneTimeTextsInCard(card: string) {
  const nodes = parseHtmlNodes(card)
  const rootIndex = nodes.findIndex((node) => node.start === 0)
  return rootIndex >= 0 ? leafTextsMatching(nodes, rootIndex, standaloneTimePattern).map((text) => {
    const m = text.match(standaloneTimePattern)
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : text
  }) : []
}

function badgeTextsInCard(card: string) {
  const nodes = parseHtmlNodes(card)
  const rootIndex = nodes.findIndex((node) => node.start === 0)
  return rootIndex >= 0 ? leafTextsMatching(nodes, rootIndex, badgeDatePattern) : []
}

function extractRawCard(card: CardContainer, _pageUrl: string): EdgeOfNorwayRawCard {
  return { title: card.title, badgeText: card.badgeText, date: card.date, timeText: card.timeText, startTime: card.timeText, allDay: !card.timeText, sourceUrl: card.sourceUrl }
}

function parseContainer(card: CardContainer): EdgeOfNorwayCardParseResult {
  if (card.skipReason) return { accepted: false, reason: card.skipReason, title: card.title || undefined, sourceUrl: card.sourceUrl }
  if (!card.title) return { accepted: false, reason: 'missing_title', sourceUrl: card.sourceUrl }
  if (!card.badgeText) return { accepted: false, reason: 'missing_badge_date', title: card.title, sourceUrl: card.sourceUrl }
  if (!card.date) return { accepted: false, reason: 'unclear_date', title: card.title, sourceUrl: card.sourceUrl }
  return { accepted: true, event: { title: card.title, sourceUrl: card.sourceUrl, date: card.date, startTime: card.timeText, allDay: !card.timeText } }
}

export function parseEdgeOfNorwayListPage(html: string, pageUrl = EDGE_OF_NORWAY_STAVANGER_LIST_URL, referenceDate: Date | string = EDGE_OF_NORWAY_DEFAULT_REFERENCE_DATE) {
  const discovery = findCardContainers(html, pageUrl, referenceDate)
  const cardContainers = discovery.containers
  const rawOccurrenceCards = cardContainers.map((card) => extractRawCard(card, pageUrl))
  const uniqueContainers: CardContainer[] = []
  const seenOccurrenceKeys = new Set<string>()
  rawOccurrenceCards.forEach((rawCard, index) => {
    const key = JSON.stringify([rawCard.sourceUrl, rawCard.date, rawCard.timeText])
    if (seenOccurrenceKeys.has(key)) return
    seenOccurrenceKeys.add(key)
    uniqueContainers.push(cardContainers[index])
  })
  const groupedByUrl = new Map<string, CardContainer[]>()
  for (const card of uniqueContainers) {
    const group = groupedByUrl.get(card.sourceUrl) || []
    group.push(card)
    groupedByUrl.set(card.sourceUrl, group)
  }
  const groupedFailureCounts = discovery.failures.reduce((counts, failure) => ({ ...counts, [failure.reason]: (counts[failure.reason] || 0) + 1 }), {} as Record<string, number>)
  const cardResults = uniqueContainers.map((card) => {
    const parsed = parseContainer(card)
    if (!parsed.accepted) return parsed
    const group = groupedByUrl.get(card.sourceUrl) || []
    const dates = Array.from(new Set(group.map((entry) => entry.date).filter(Boolean)))
    if (dates.length > 1) return { accepted: false as const, reason: 'recurring_event' as EdgeOfNorwaySkipReason, title: card.title || undefined, sourceUrl: card.sourceUrl }
    return parsed
  })
  for (const result of cardResults) if (!result.accepted && (result.reason === 'recurring_event' || result.reason === 'multiple_dates')) groupedFailureCounts[result.reason] = (groupedFailureCounts[result.reason] || 0) + 1
  const rawCards = uniqueContainers.map((card) => extractRawCard(card, pageUrl))
  return {
    eventAnchorsDiscovered: discovery.eventAnchorsDiscovered,
    readMoreAnchorsDiscovered: discovery.readMoreAnchorsDiscovered,
    rawSegmentsCreated: cardContainers.length,
    occurrencesResolved: cardContainers.length,
    rawCardsParsed: rawOccurrenceCards.length,
    titleAnchorsFound: discovery.titleAnchorsFound,
    occurrenceListItemsResolved: cardContainers.length,
    uniqueCardNodes: cardContainers.length,
    rawOccurrencesParsed: rawOccurrenceCards.filter((card) => card.title && card.badgeText && card.date).length,
    cardsMissingBadge: discovery.failures.filter((f) => f.reason === 'missing_badge_date').length,
    cardsMissingReadMore: 0,
    cardsContainingOtherEvent: 0,
    uniqueEventUrls: discovery.uniqueEventUrls,
    urlGroupsWithTitleAndReadMore: discovery.urlGroupsWithTitleAndReadMore,
    cardCandidatesResolved: cardResults.length,
    cardsWithOneBadgeDate: rawCards.filter((card) => card.badgeText).length,
    cardsWithTime: rawCards.filter((card) => card.timeText).length,
    cardsWithoutTime: rawCards.filter((card) => !card.timeText).length,
    groupedFailureCounts,
    errorExamples: discovery.failures.slice(0, 10),
    cardsDiscovered: cardResults.length,
    validCardsParsedBeforeGrouping: cardResults.filter((r) => r.accepted).length,
    exactDuplicateCardsRemoved: rawOccurrenceCards.length - rawCards.length,
    results: cardResults,
    rawCards,
    missingRawFields: rawCards.map((card, index) => ({ index, titleMissing: !card.title, badgeMissing: !card.badgeText, sourceUrlMissing: !card.sourceUrl })).filter((card) => card.titleMissing || card.badgeMissing || card.sourceUrlMissing),
    cardRoots: cardContainers.map((card) => ({ tagName: card.rootTagName, className: card.rootClassName })),
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

function structuredDiagnosticError(reason: string, error: unknown): EdgeOfNorwayDiagnosticResult {
  const message = error instanceof Error && error.message ? error.message : reason
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_STAVANGER_LIST_URL, cardsDiscovered: 0, validCardsParsed: 0, exactDuplicateCardsRemoved: 0, uniqueSourceUrls: 0, acceptedCount: 0, skippedCounts: { [reason]: 1 }, acceptedEvents: [], parsingErrors: [{ reason, title: message }], error: message }
}

export async function runEdgeOfNorwayShadowDiagnostic(fetchImpl = fetch, referenceDate: Date | string = EDGE_OF_NORWAY_DEFAULT_REFERENCE_DATE): Promise<EdgeOfNorwayDiagnosticResult> {
  return withTimeout((async () => {
    const skippedCounts: Record<string, number> = {}
    const acceptedEvents: EdgeOfNorwayAcceptedEvent[] = []
    const parsingErrors: Array<{ title?: string; sourceUrl?: string; reason: string }> = []
    const controller = new AbortController()
    const fetchTimer = setTimeout(() => controller.abort(), 15_000)
    let listResp: Response
    try {
      listResp = await fetchImpl(EDGE_OF_NORWAY_STAVANGER_LIST_URL, { headers: { 'user-agent': EDGE_OF_NORWAY_USER_AGENT }, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) return structuredDiagnosticError('timeout', error)
      return structuredDiagnosticError('fetch_failed', error)
    } finally {
      clearTimeout(fetchTimer)
    }
    if (!listResp.ok) return structuredDiagnosticError('fetch_failed', new Error(`Failed to fetch list page: ${listResp.status}`))
    let parsed: ReturnType<typeof parseEdgeOfNorwayListPage>
    try {
      parsed = parseEdgeOfNorwayListPage(await listResp.text(), EDGE_OF_NORWAY_STAVANGER_LIST_URL, referenceDate)
    } catch (error) {
      return structuredDiagnosticError('parser_failed', error)
    }
    for (const result of parsed.results) {
      if (result.accepted) acceptedEvents.push(result.event)
      else {
        skippedCounts[result.reason] = (skippedCounts[result.reason] || 0) + 1
        if (parsingErrors.length < 10) parsingErrors.push({ title: result.title, sourceUrl: result.sourceUrl, reason: result.reason })
      }
    }
    return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_STAVANGER_LIST_URL, cardsDiscovered: parsed.cardsDiscovered, validCardsParsed: parsed.validCardsParsedBeforeGrouping, exactDuplicateCardsRemoved: parsed.exactDuplicateCardsRemoved, uniqueSourceUrls: parsed.uniqueEventUrls, acceptedCount: acceptedEvents.length, skippedCounts: { ...parsed.groupedFailureCounts, ...skippedCounts }, acceptedEvents, parsingErrors: [...parsed.errorExamples.map((e) => ({ title: e.title, sourceUrl: e.sourceUrl, reason: e.reason })), ...parsingErrors].slice(0, 10), eventAnchorsDiscovered: parsed.eventAnchorsDiscovered, readMoreAnchorsDiscovered: parsed.readMoreAnchorsDiscovered, occurrencesResolved: parsed.occurrencesResolved, rawCardsParsed: parsed.rawCardsParsed, titleAnchorsFound: parsed.titleAnchorsFound, occurrenceListItemsResolved: parsed.occurrenceListItemsResolved, uniqueCardNodes: parsed.uniqueCardNodes, rawOccurrencesParsed: parsed.rawOccurrencesParsed, rawSegmentsCreated: parsed.rawSegmentsCreated, cardsMissingBadge: parsed.cardsMissingBadge, cardsMissingReadMore: parsed.cardsMissingReadMore, cardsContainingOtherEvent: parsed.cardsContainingOtherEvent, urlGroupsWithTitleAndReadMore: parsed.urlGroupsWithTitleAndReadMore, cardsWithOneBadgeDate: parsed.cardsWithOneBadgeDate, cardsWithTime: parsed.cardsWithTime, cardsWithoutTime: parsed.cardsWithoutTime, cardRoots: parsed.cardRoots, rawCards: parsed.rawCards.slice(0, 5), missingRawFields: parsed.missingRawFields }
  })(), 25_000, 'timeout').catch((error) => structuredDiagnosticError(error instanceof Error && error.message === 'timeout' ? 'timeout' : 'parser_failed', error))
}
