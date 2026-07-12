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
type AnchorInfo = { nodeIndex: number; html: string; text: string; url: string; isReadMore: boolean; isTitle: boolean }
type CardContainer = { html: string; sourceUrl: string; title: string; rootTagName: string; rootClassName?: string; start: number; end: number }
type DiscoveryFailureReason = 'missing_title_anchor' | 'missing_read_more_anchor' | 'no_common_ancestor' | 'ancestor_contains_other_event' | 'missing_badge_date' | 'multiple_badge_dates'
type DiscoveryFailure = { reason: DiscoveryFailureReason; sourceUrl?: string; title?: string }
export type EdgeOfNorwayRawCard = { title: string | null; badgeText: string | null; timeText: string | null; sourceUrl: string | null }

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

export const EDGE_OF_NORWAY_CARD_WRAPPER_SELECTOR = 'li.event-card'
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
    const isTitle = Boolean(normalized) && !isReadMore && !/^book\b/i.test(normalized)
    return { nodeIndex, html: node.html, text: normalized, url, isReadMore, isTitle }
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

function badgeDateTexts(card: string) {
  const matches = textWithoutAnchorsScriptsStyles(card).match(/\b\d{1,2}\.\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|mai|jun(?:e|i)?|jul(?:y|i)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\.)?(?=\s|$)/gi) || []
  return Array.from(new Set(matches.map((text) => text.replace(/\s+/g, ' ').trim())))
}

function countBadgeTexts(card: string) {
  return badgeDateTexts(card)
}

function lowestCommonAncestor(nodes: HtmlNode[], a: number, b: number, maxLevels = 10) {
  const seen = new Set<number>()
  let current: number | null = a
  for (let level = 0; current != null && current >= 0 && level <= maxLevels; level += 1) {
    seen.add(current)
    current = nodes[current].parent
  }
  current = b
  for (let level = 0; current != null && current >= 0 && level <= maxLevels; level += 1) {
    if (seen.has(current)) return current
    current = nodes[current].parent
  }
  return null
}

function cardHasOtherEventUrl(card: string, pageUrl: string, sourceUrl: string) {
  for (const m of card.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = canonicalizeFjordNorwayUrl(m[1], pageUrl)
    if (url && url !== sourceUrl) return true
  }
  return false
}

function findCardContainers(html: string, pageUrl: string, _referenceDate: Date | string) {
  const nodes = parseHtmlNodes(html)
  const anchors = eventAnchors(nodes, pageUrl)
  const byUrl = new Map<string, AnchorInfo[]>()
  for (const anchor of anchors) byUrl.set(anchor.url, [...(byUrl.get(anchor.url) || []), anchor])
  const failures: DiscoveryFailure[] = []
  const containers: CardContainer[] = []
  const seenRoots = new Set<string>()
  let groupsWithBoth = 0

  for (const [sourceUrl, group] of byUrl) {
    const titleAnchors = group.filter((a) => a.isTitle)
    const readMoreAnchors = group.filter((a) => a.isReadMore)
    if (titleAnchors.length === 0) failures.push({ reason: 'missing_title_anchor', sourceUrl })
    if (readMoreAnchors.length === 0) failures.push({ reason: 'missing_read_more_anchor', sourceUrl, title: titleAnchors[0]?.text })
    if (!titleAnchors.length || !readMoreAnchors.length) continue
    groupsWithBoth += 1

    for (const titleAnchor of titleAnchors) {
      for (const readMoreAnchor of readMoreAnchors) {
        const lca = lowestCommonAncestor(nodes, titleAnchor.nodeIndex, readMoreAnchor.nodeIndex, 10)
        if (lca == null) { failures.push({ reason: 'no_common_ancestor', sourceUrl, title: titleAnchor.text }); continue }
        const node = nodes[lca]
        const card = node.html
        if (!card.includes(titleAnchor.html) || !card.includes(readMoreAnchor.html)) { failures.push({ reason: 'no_common_ancestor', sourceUrl, title: titleAnchor.text }); continue }
        if (cardHasOtherEventUrl(card, pageUrl, sourceUrl)) { failures.push({ reason: 'ancestor_contains_other_event', sourceUrl, title: titleAnchor.text }); continue }
        const titleLinks = countEventTitleLinks(card, pageUrl)
        if (titleLinks.count !== 1 || !titleLinks.urls.has(sourceUrl)) { failures.push({ reason: 'ancestor_contains_other_event', sourceUrl, title: titleAnchor.text }); continue }
        const badges = badgeDateTexts(card)
        if (badges.length === 0) { failures.push({ reason: 'missing_badge_date', sourceUrl, title: titleAnchor.text }); continue }
        if (badges.length > 1) { failures.push({ reason: 'multiple_badge_dates', sourceUrl, title: titleAnchor.text }); continue }
        const key = `${node.start}:${node.end}:${sourceUrl}:${titleAnchor.text}`
        if (seenRoots.has(key)) continue
        seenRoots.add(key)
        containers.push({ html: card, sourceUrl, title: titleAnchor.text, rootTagName: node.tagName, rootClassName: attr(openingTagOfNode(node), 'class') || undefined, start: node.start, end: node.end })
      }
    }
  }

  return { containers: containers.sort((a, b) => a.start - b.start), failures, eventAnchorsDiscovered: anchors.length, uniqueEventUrls: byUrl.size, urlGroupsWithTitleAndReadMore: groupsWithBoth }
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
  const badgeMatches = badgeDateTexts(card).map((text) => parseBadgeDateText(text, referenceDate)).filter(Boolean) as string[]
  return Array.from(new Set(badgeMatches))
}

function extractClockTime(card: string) {
  return parseTime(textWithoutAnchorsScriptsStyles(card))
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

function extractRawCard(card: string, pageUrl: string): EdgeOfNorwayRawCard {
  const sourceUrl = extractReadMoreUrl(card, pageUrl)
  return { title: extractRawTitle(card, sourceUrl, pageUrl), badgeText: extractRawBadgeText(card), timeText: extractRawTimeText(card), sourceUrl }
}

function parseCard(card: string, pageUrl: string, referenceDate: Date | string): EdgeOfNorwayCardParseResult {
  const sourceUrl = extractReadMoreUrl(card, pageUrl) || undefined
  const title = sourceUrl ? extractTitle(card, sourceUrl, pageUrl) || undefined : undefined
  if (!sourceUrl) return { accepted: false, reason: 'missing_source_url', title: stripTags(card.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] || '') || undefined }
  if (!title) return { accepted: false, reason: 'missing_title', sourceUrl }
  const dates = extractBadgeDates(card, referenceDate)
  if (dates.length === 0) return { accepted: false, reason: 'unclear_date', title, sourceUrl }
  if (dates.length > 1) return { accepted: false, reason: 'multiple_dates', title, sourceUrl }
  const text = stripTags(card)
  if (/\b(exhibition|exhibited|continuous|ongoing)\b/i.test(text)) return { accepted: false, reason: 'exhibition_or_continuous', title, sourceUrl }
  if (/\b(recurring|every\s+(day|week|month)|weekly|daily)\b/i.test(text)) return { accepted: false, reason: 'recurring_event', title, sourceUrl }
  const time = extractClockTime(card)
  return { accepted: true, event: { title, sourceUrl, date: dates[0], startTime: time, allDay: !time } }
}

export function parseEdgeOfNorwayListPage(html: string, pageUrl = EDGE_OF_NORWAY_STAVANGER_LIST_URL, referenceDate: Date | string = EDGE_OF_NORWAY_DEFAULT_REFERENCE_DATE) {
  const discovery = findCardContainers(html, pageUrl, referenceDate)
  const cardContainers = discovery.containers
  const rawCards = cardContainers.map((card) => extractRawCard(card.html, pageUrl))
  const cardResults = cardContainers.map((card) => parseCard(card.html, pageUrl, referenceDate))
  return {
    eventAnchorsDiscovered: discovery.eventAnchorsDiscovered,
    uniqueEventUrls: discovery.uniqueEventUrls,
    urlGroupsWithTitleAndReadMore: discovery.urlGroupsWithTitleAndReadMore,
    cardCandidatesResolved: cardResults.length,
    cardsWithOneBadgeDate: rawCards.filter((card) => card.badgeText).length,
    cardsWithTime: rawCards.filter((card) => card.timeText).length,
    cardsWithoutTime: rawCards.filter((card) => !card.timeText).length,
    groupedFailureCounts: discovery.failures.reduce((counts, failure) => ({ ...counts, [failure.reason]: (counts[failure.reason] || 0) + 1 }), {} as Record<string, number>),
    errorExamples: discovery.failures.slice(0, 10),
    cardsDiscovered: cardResults.length,
    validCardsParsedBeforeGrouping: cardResults.filter((r) => r.accepted).length,
    exactDuplicateCardsRemoved: 0,
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
    return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_STAVANGER_LIST_URL, cardsDiscovered: parsed.cardsDiscovered, validCardsParsed: parsed.validCardsParsedBeforeGrouping, exactDuplicateCardsRemoved: parsed.exactDuplicateCardsRemoved, uniqueSourceUrls: parsed.uniqueEventUrls, acceptedCount: acceptedEvents.length, skippedCounts: { ...parsed.groupedFailureCounts, ...skippedCounts }, acceptedEvents, parsingErrors: [...parsed.errorExamples.map((e) => ({ title: e.title, sourceUrl: e.sourceUrl, reason: e.reason })), ...parsingErrors].slice(0, 10), eventAnchorsDiscovered: parsed.eventAnchorsDiscovered, urlGroupsWithTitleAndReadMore: parsed.urlGroupsWithTitleAndReadMore, cardsWithOneBadgeDate: parsed.cardsWithOneBadgeDate, cardsWithTime: parsed.cardsWithTime, cardsWithoutTime: parsed.cardsWithoutTime, cardRoots: parsed.cardRoots, rawCards: parsed.rawCards.slice(0, 5), missingRawFields: parsed.missingRawFields }
  })(), 25_000, 'timeout').catch((error) => structuredDiagnosticError(error instanceof Error && error.message === 'timeout' ? 'timeout' : 'parser_failed', error))
}
