export const EDGE_OF_NORWAY_PROVIDER = 'edge-of-norway' as const
export const EDGE_OF_NORWAY_MODE = 'shadow' as const
export const EDGE_OF_NORWAY_STAVANGER_LIST_URL = 'https://www.edgeofnorway.com/en/events?date=next_30&filtertype=place&place=stavanger'
export const EDGE_OF_NORWAY_USER_AGENT = 'RE:MIND local-events shadow diagnostics (no persistence; contact hello@remind.no)'

export type EdgeOfNorwaySkipReason =
  | 'multiple_dates'
  | 'recurring_event'
  | 'exhibition_or_continuous'
  | 'date_range'
  | 'unclear_date'
  | 'missing_showing_container'
  | 'conflicting_showing_data'
  | 'fetch_failed'

export type EdgeOfNorwayAcceptedEvent = {
  title: string
  sourceUrl: string
  date: string
  startTime: string | null
  allDay: boolean
}

export type EdgeOfNorwayDetailResult =
  | { accepted: true; event: EdgeOfNorwayAcceptedEvent }
  | { accepted: false; reason: EdgeOfNorwaySkipReason; title: string | null; sourceUrl: string }

export type EdgeOfNorwayListCandidate = { title: string; sourceUrl: string }

export type EdgeOfNorwayDiagnosticResult = {
  provider: typeof EDGE_OF_NORWAY_PROVIDER
  mode: typeof EDGE_OF_NORWAY_MODE
  listPageUrl: string
  detailPagesDiscovered: number
  duplicateUrlsRemoved: number
  detailPagesFetched: number
  acceptedCount: number
  skippedCounts: Record<string, number>
  acceptedEvents: EdgeOfNorwayAcceptedEvent[]
  fetchErrors: string[]
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
  return decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
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

export function parseEdgeOfNorwayListPage(html: string, pageUrl = EDGE_OF_NORWAY_STAVANGER_LIST_URL): EdgeOfNorwayListCandidate[] {
  const candidates: EdgeOfNorwayListCandidate[] = []
  for (const m of html.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const tag = m[0].match(/^<a\b[^>]*>/i)?.[0] || ''
    const canonical = canonicalizeFjordNorwayUrl(attr(tag, 'href') || '', pageUrl)
    if (!canonical) continue
    const title = stripTags(m[0])
    if (!title) continue
    candidates.push({ title, sourceUrl: canonical })
  }
  return candidates
}

function parseIsoDate(value: string) {
  const m = value.match(/(20\d{2})-(\d{2})-(\d{2})(?=\D|$)/)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function parseTime(value: string) {
  const m = value.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

function tagNameFromOpeningTag(tag: string) {
  return tag.match(/^<\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() || null
}

function isVoidTag(tagName: string) {
  return ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(tagName)
}

function tagContainsShowingMarker(tag: string) {
  return /\bdata-(?:event-showing|showing-container|edge-showing)\b/i.test(tag) || /\bclass=["'][^"']*\b(?:event-showing|showing-container|showing-card|showing-item)\b/i.test(tag)
}

function extractElementAt(html: string, openStart: number) {
  const openEnd = html.indexOf('>', openStart)
  if (openEnd < 0) return null
  const openingTag = html.slice(openStart, openEnd + 1)
  const rootName = tagNameFromOpeningTag(openingTag)
  if (!rootName) return null
  if (isVoidTag(rootName) || /\/\s*>$/.test(openingTag)) return openingTag

  let depth = 1
  const tagRe = /<\/?\s*([a-z0-9-]+)\b[^>]*>/gi
  tagRe.lastIndex = openEnd + 1
  for (const match of html.matchAll(tagRe)) {
    const raw = match[0]
    const name = match[1].toLowerCase()
    if (name !== rootName) continue
    if (/^<\s*\//.test(raw)) {
      depth -= 1
      if (depth === 0) return html.slice(openStart, Number(match.index) + raw.length)
    } else if (!isVoidTag(name) && !/\/\s*>$/.test(raw)) {
      depth += 1
    }
  }
  return null
}

function getShowingContainers(html: string) {
  const containers: string[] = []
  for (const match of html.matchAll(/<([a-z0-9-]+)\b[^>]*>/gi)) {
    const tag = match[0]
    if (!tagContainsShowingMarker(tag)) continue
    const element = extractElementAt(html, Number(match.index))
    if (element) containers.push(element)
  }
  return containers
}

function removeForbiddenDateSources(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<button\b[\s\S]*?<\/button>/gi, ' ')
    .replace(/<[^>]+\b(?:aria-selected=["']true["']|data-selected=["']true["']|class=["'][^"']*\b(?:active|selected)\b)[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
}

function titleFromHtml(html: string) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) return stripTags(h1[1])
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return title ? stripTags(title[1]).replace(/\s*\|\s*Fjord Norway\s*$/i, '') : null
}

function hasClassifiedSkip(text: string): EdgeOfNorwaySkipReason | null {
  if (/\b(recurring|every\s+(day|week|month|friday|saturday|sunday)|weekly|daily)\b/i.test(text)) return 'recurring_event'
  if (/\b(exhibition|exhibited|continuous|ongoing)\b/i.test(text)) return 'exhibition_or_continuous'
  if (/\b(date\s*range|from\s+20\d{2}-\d{2}-\d{2}\s+(to|until)|20\d{2}-\d{2}-\d{2}\s*[–—-]\s*20\d{2}-\d{2}-\d{2})\b/i.test(text)) return 'date_range'
  return null
}

export function parseEdgeOfNorwayDetailPage(html: string, sourceUrl: string, fallbackTitle?: string): EdgeOfNorwayDetailResult {
  const title = titleFromHtml(html) || fallbackTitle || null
  const containers = getShowingContainers(html)
  if (containers.length !== 1) return { accepted: false, reason: containers.length > 1 ? 'multiple_dates' : 'missing_showing_container', title, sourceUrl }

  const container = removeForbiddenDateSources(containers[0])
  const containerText = stripTags(container)
  const containerSkip = hasClassifiedSkip(containerText)
  if (containerSkip) return { accepted: false, reason: containerSkip, title, sourceUrl }
  const explicitDates = Array.from(container.matchAll(/data-event-date=["']([^"']+)["']/gi)).map((m) => parseIsoDate(m[1])).filter(Boolean) as string[]
  const timeDates = Array.from(container.matchAll(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/gi)).map((m) => parseIsoDate(m[1])).filter(Boolean) as string[]
  const textDates = Array.from(containerText.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)).map((m) => parseIsoDate(m[0])).filter(Boolean) as string[]
  const explicitUnique = Array.from(new Set(explicitDates))
  const timeUnique = Array.from(new Set(timeDates))
  const textUnique = Array.from(new Set(textDates))
  if (explicitUnique.length > 1 || timeUnique.length > 1 || textUnique.length > 1) return { accepted: false, reason: 'multiple_dates', title, sourceUrl }
  const uniqueDates = Array.from(new Set([...explicitUnique, ...timeUnique, ...textUnique]))
  if (uniqueDates.length > 1) return { accepted: false, reason: 'conflicting_showing_data', title, sourceUrl }
  if (uniqueDates.length !== 1) return { accepted: false, reason: 'unclear_date', title, sourceUrl }
  const timeValues = Array.from(new Set([...Array.from(container.matchAll(/data-start-time=["']([^"']+)["']/gi)).map((m) => parseTime(m[1])), parseTime(containerText)].filter(Boolean) as string[]))
  if (timeValues.length > 1) return { accepted: false, reason: 'conflicting_showing_data', title, sourceUrl }
  return { accepted: true, event: { title: title || fallbackTitle || 'Untitled event', sourceUrl, date: uniqueDates[0], startTime: timeValues[0] || null, allDay: !timeValues[0] } }
}

export async function runEdgeOfNorwayShadowDiagnostic(fetchImpl = fetch): Promise<EdgeOfNorwayDiagnosticResult> {
  const listResp = await fetchImpl(EDGE_OF_NORWAY_STAVANGER_LIST_URL, { headers: { 'user-agent': EDGE_OF_NORWAY_USER_AGENT } })
  if (!listResp.ok) throw new Error(`Failed to fetch list page: ${listResp.status}`)
  const candidates = parseEdgeOfNorwayListPage(await listResp.text())
  const discovered = candidates.length
  const unique = Array.from(new Map(candidates.map((c) => [c.sourceUrl, c])).values())
  const skippedCounts: Record<string, number> = {}
  const acceptedEvents: EdgeOfNorwayAcceptedEvent[] = []
  const fetchErrors: string[] = []
  let fetched = 0
  for (const candidate of unique) {
    try {
      const resp = await fetchImpl(candidate.sourceUrl, { headers: { 'user-agent': EDGE_OF_NORWAY_USER_AGENT } })
      fetched += 1
      if (!resp.ok) throw new Error(String(resp.status))
      const parsed = parseEdgeOfNorwayDetailPage(await resp.text(), candidate.sourceUrl, candidate.title)
      if (parsed.accepted) acceptedEvents.push(parsed.event)
      else skippedCounts[parsed.reason] = (skippedCounts[parsed.reason] || 0) + 1
    } catch (error: unknown) {
      skippedCounts.fetch_failed = (skippedCounts.fetch_failed || 0) + 1
      const message = error instanceof Error && error.message ? error.message : 'Unknown fetch error'
      fetchErrors.push(`${candidate.sourceUrl}: ${message}`)
    }
  }
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_STAVANGER_LIST_URL, detailPagesDiscovered: discovered, duplicateUrlsRemoved: discovered - unique.length, detailPagesFetched: fetched, acceptedCount: acceptedEvents.length, skippedCounts, acceptedEvents, fetchErrors }
}
