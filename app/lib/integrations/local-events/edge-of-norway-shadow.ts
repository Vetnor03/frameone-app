export const EDGE_OF_NORWAY_PROVIDER = 'edge-of-norway' as const
export const EDGE_OF_NORWAY_MODE = 'shadow' as const
export type LocalEventArea = 'stavanger-area'

export const EDGE_OF_NORWAY_AREA_PLACES: Record<
  LocalEventArea,
  readonly string[]
> = {
  'stavanger-area': [
    'stavanger',
    'sola',
    'sandnes',
    'randaberg',
  ],
}

export const EDGE_OF_NORWAY_SELECTED_AREA: LocalEventArea = 'stavanger-area'

export function buildEdgeOfNorwayEventsUrl(area: LocalEventArea = EDGE_OF_NORWAY_SELECTED_AREA) {
  const url = new URL('https://www.edgeofnorway.com/en/events')
  url.searchParams.set('date', 'next_30')
  url.searchParams.set('filtertype', 'place')
  for (const place of EDGE_OF_NORWAY_AREA_PLACES[area]) url.searchParams.append('place', place)
  return url.toString()
}

export const EDGE_OF_NORWAY_EVENTS_URL = buildEdgeOfNorwayEventsUrl()
export const EDGE_OF_NORWAY_USER_AGENT = 'Mozilla/5.0 (compatible; REMIND-LocalEvents/1.0; +https://www.edgeofnorway.com/)'

export type EdgeOfNorwaySkipReason =
  | 'multiple_dates'
  | 'recurring_event'
  | 'exhibition_or_continuous'
  | 'unclear_date'
  | 'missing_title'
  | 'missing_source_url'
  | 'fetch_failed'
  | 'timeout'
  | 'parser_failed'
  | 'inspect_input'
  | 'unclear_time'
  | 'multiple_times'
  | 'repeated_series'

export type EdgeOfNorwayAcceptedEvent = {
  title: string
  sourceUrl: string
  date: string
  startTime: string | null
  allDay: boolean
}

export type EdgeOfNorwayRepeatedSeriesExample = {
  title: string
  venueName: string | null
  startTime: string | null
  dates: string[]
  sourceUrls: string[]
}

type SeriesCandidateMetadata = { venueName: string | null; shortDescription: string }
type AcceptedSeriesCandidate = EdgeOfNorwayAcceptedEvent & SeriesCandidateMetadata

type EventParseResult =
  | { accepted: true; event: AcceptedSeriesCandidate }
  | { accepted: false; reason: EdgeOfNorwaySkipReason; title?: string; sourceUrl?: string }

type PublicEventParseResult =
  | { accepted: true; event: EdgeOfNorwayAcceptedEvent }
  | { accepted: false; reason: EdgeOfNorwaySkipReason; title?: string; sourceUrl?: string }

function isAcceptedResult(result: PublicEventParseResult): result is Extract<PublicEventParseResult, { accepted: true }> {
  return result.accepted
}

function isSkippedResult(result: PublicEventParseResult): result is Extract<PublicEventParseResult, { accepted: false }> {
  return !result.accepted
}

type EdgeOfNorwayListParseResult = {
  flightScriptsFound: number
  flightChunksDecoded: number
  malformedChunks: number
  eventObjectsFound: number
  uniqueEvents: number
  acceptedCount: number
  skippedCounts: Record<string, number>
  repeatedSeriesCount: number
  repeatedSeriesEventsCount: number
  repeatedSeriesExamples: EdgeOfNorwayRepeatedSeriesExample[]
  results: PublicEventParseResult[]
  parsingErrors: Array<{ reason: string }>
}

type EdgeOfNorwayDiagnosticError = { stage: 'authentication' | 'fetch' | 'read_response' | 'inspect_input' | 'decode_flight' | 'extract_events'; message: string; name?: string; code?: string; requestedUrl?: string; finalUrl?: string }
type EdgeOfNorwayFetchDiagnostic = { requestedUrl: string; finalUrl: string; finalHostname: string | null; status: number; ok: boolean; redirected: boolean; redirectStatus: boolean; contentType: string | null; contentLengthHeader: string | null; htmlLength: number; startsWithDoctype: boolean; documentTitle: string | null; containsLoadingPlaceholder: boolean; containsKnownEventText: boolean; rawFlightMarkerCount: number; escapedEventMarkerCount: number; htmlPreview?: string }

export type EdgeOfNorwayDiagnosticResult = {
  provider: typeof EDGE_OF_NORWAY_PROVIDER
  mode: typeof EDGE_OF_NORWAY_MODE
  listPageUrl: string
  flightScriptsFound: number
  flightChunksDecoded: number
  malformedChunks: number
  eventObjectsFound: number
  uniqueEvents: number
  acceptedCount: number
  skippedCounts: Record<string, number>
  acceptedEvents: EdgeOfNorwayAcceptedEvent[]
  repeatedSeriesCount: number
  repeatedSeriesEventsCount: number
  repeatedSeriesExamples: EdgeOfNorwayRepeatedSeriesExample[]
  parsingErrors: Array<{ title?: string; sourceUrl?: string; reason: string }>
  networkError?: string
  error?: string
  diagnosticError?: EdgeOfNorwayDiagnosticError
  fetch?: EdgeOfNorwayFetchDiagnostic
}

type FlightDecodeResult = { flightText: string; flightScriptsFound: number; flightChunksDecoded: number; malformedChunks: number; parsingErrors: Array<{ reason: string }> }

type StructuredEvent = {
  _id?: unknown
  _type?: unknown
  locTitle?: { en?: unknown }
  locSlug?: { en?: { current?: unknown } }
  locShortDescription?: { en?: unknown }
  locDescription?: { en?: unknown }
  venue?: unknown
  location?: unknown
  event?: {
    _type?: unknown
    recurring?: unknown
    recurringShowings?: unknown
    showings?: Array<{ date?: unknown; schedule?: Array<{ hour?: unknown; minutes?: unknown }> }>
  }
}

const eventObjectMarker = '"data"'
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

export function inspectEdgeOfNorwayHtmlInput(html: string, requestedUrl = EDGE_OF_NORWAY_EVENTS_URL, response?: Response) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const rawFlightMarkerCount = html.match(/self\.__next_f\.push\(/g)?.length ?? 0
  return {
    requestedUrl,
    finalUrl: response?.url || requestedUrl,
    finalHostname: hostnameForUrl(response?.url || requestedUrl),
    status: response?.status ?? 0,
    ok: response?.ok ?? true,
    redirected: response?.redirected ?? false,
    redirectStatus: isRedirectStatus(response?.status ?? 0),
    contentType: response?.headers?.get('content-type') ?? null,
    contentLengthHeader: response?.headers?.get('content-length') ?? null,
    htmlLength: html.length,
    startsWithDoctype: /^\s*<!doctype/i.test(html),
    documentTitle: titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() || null : null,
    containsLoadingPlaceholder: />\s*Loading\s*</i.test(html) || html.includes('Loading...'),
    containsKnownEventText: html.includes('Viking - Sandefjord') || html.includes('Stavanger Football Festival in Vågen | FINAL'),
    rawFlightMarkerCount,
    escapedEventMarkerCount: html.match(/\\"_type\\":\\"Event\\"/g)?.length ?? 0,
    ...(rawFlightMarkerCount === 0 ? { htmlPreview: html.slice(0, 200).replace(/\s+/g, ' ') } : {}),
  }
}

function extractPushArgument(text: string, openParenIndex: number) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = openParenIndex; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
      if (depth === 0 && char === ')') return text.slice(openParenIndex + 1, index)
      if (depth < 0) return null
    }
  }
  return null
}

export function decodeFlightPayload(html: string): FlightDecodeResult {
  const result: FlightDecodeResult = { flightText: '', flightScriptsFound: 0, flightChunksDecoded: 0, malformedChunks: 0, parsingErrors: [] }
  const marker = 'self.__next_f.push('
  let cursor = 0
  while (cursor < html.length) {
    const markerIndex = html.indexOf(marker, cursor)
    if (markerIndex < 0) break
    result.flightScriptsFound += 1
    const openParenIndex = markerIndex + marker.length - 1
    const argument = extractPushArgument(html, openParenIndex)
    if (!argument) {
      result.malformedChunks += 1
      if (result.parsingErrors.length < 10) result.parsingErrors.push({ reason: 'malformed_flight_chunk: unbalanced push call' })
      cursor = markerIndex + marker.length
      continue
    }
    try {
      const parsed = JSON.parse(argument)
      if (Array.isArray(parsed) && parsed[0] === 1 && typeof parsed[1] === 'string') {
        result.flightText += parsed[1]
        result.flightChunksDecoded += 1
      } else {
        result.malformedChunks += 1
      }
    } catch (error) {
      result.malformedChunks += 1
      if (result.parsingErrors.length < 10) result.parsingErrors.push({ reason: error instanceof Error ? `malformed_flight_chunk: ${error.message}` : 'malformed_flight_chunk' })
    }
    cursor = openParenIndex + argument.length + 2
  }
  return result
}

function extractBalancedJsonObject(text: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
      if (depth < 0) return null
    }
  }
  return null
}

function extractStructuredEvents(flightText: string) {
  const events: StructuredEvent[] = []
  const parsingErrors: Array<{ reason: string }> = []
  let eventObjectsFound = 0
  let cursor = 0
  while (cursor < flightText.length) {
    const markerIndex = flightText.indexOf(eventObjectMarker, cursor)
    if (markerIndex < 0) break
    const colonIndex = flightText.indexOf(':', markerIndex + eventObjectMarker.length)
    if (colonIndex < 0) break
    let objectStart = colonIndex + 1
    while (/\s/.test(flightText[objectStart] || '')) objectStart += 1
    if (flightText[objectStart] !== '{') {
      cursor = colonIndex + 1
      continue
    }
    const rawObject = extractBalancedJsonObject(flightText, objectStart)
    if (!rawObject) {
      if (parsingErrors.length < 10) parsingErrors.push({ reason: 'unbalanced_data_object' })
      cursor = objectStart + 1
      continue
    }
    try {
      const parsed = JSON.parse(rawObject) as StructuredEvent
      if (parsed?._type === 'Event' && parsed._id && parsed.event?._type === 'EventInfo') {
        eventObjectsFound += 1
        events.push(parsed)
      }
    } catch (error) {
      if (parsingErrors.length < 10) parsingErrors.push({ reason: error instanceof Error ? `invalid_data_object: ${error.message}` : 'invalid_data_object' })
    }
    cursor = objectStart + rawObject.length
  }
  const uniqueById = new Map<string, StructuredEvent>()
  for (const event of events) {
    const id = String(event._id)
    if (!uniqueById.has(id)) uniqueById.set(id, event)
  }
  return { eventObjectsFound, uniqueEvents: Array.from(uniqueById.values()), parsingErrors }
}

function sourceUrlForSlug(slug: unknown) {
  return typeof slug === 'string' && slug.trim() ? `https://www.fjordnorway.com/en/events/${slug.trim()}` : null
}

function parseSchedulePart(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null

  const text = String(value).trim()
  if (!/^\d{1,2}$/.test(text)) return null

  const parsed = Number(text)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null

  return parsed
}

function parseTime(schedule: unknown): { accepted: true; startTime: string | null; allDay: boolean } | { accepted: false; reason: EdgeOfNorwaySkipReason } {
  if (!Array.isArray(schedule) || schedule.length === 0) return { accepted: true, startTime: null, allDay: true }
  const times = new Set<string>()
  for (const entry of schedule) {
    const hour = parseSchedulePart((entry as { hour?: unknown })?.hour, 0, 23)
    const minutes = parseSchedulePart((entry as { minutes?: unknown })?.minutes, 0, 59)
    if (hour === null || minutes === null) return { accepted: false, reason: 'unclear_time' }
    times.add(`${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
  }
  if (times.size > 1) return { accepted: false, reason: 'multiple_times' }
  return { accepted: true, startTime: Array.from(times)[0], allDay: false }
}

function localizedEnglishText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.en === 'string') return record.en.trim()
    if (typeof record.name === 'string') return record.name.trim()
    if (typeof record.title === 'string') return record.title.trim()
  }
  return ''
}

function venueNameForEvent(eventObject: StructuredEvent): string | null {
  const candidates = [eventObject.venue, eventObject.location]
  for (const candidate of candidates) {
    const direct = localizedEnglishText(candidate)
    if (direct) return direct
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>
      const nested = localizedEnglishText(record.locTitle) || localizedEnglishText(record.title) || localizedEnglishText(record.name)
      if (nested) return nested
    }
  }
  return null
}

function shortDescriptionForEvent(eventObject: StructuredEvent): string {
  return localizedEnglishText(eventObject.locShortDescription) || localizedEnglishText(eventObject.locDescription)
}

function normalizeSeriesText(value: string | null): string {
  return (value || '')
    .normalize('NFKC')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function repeatedSeriesKey(event: AcceptedSeriesCandidate) {
  return [normalizeSeriesText(event.title), normalizeSeriesText(event.venueName), normalizeSeriesText(event.startTime), normalizeSeriesText(event.shortDescription)].join('\u001f')
}

function splitRepeatedSeriesCandidates(results: EventParseResult[]) {
  const groups = new Map<string, AcceptedSeriesCandidate[]>()
  for (const result of results) {
    if (!result.accepted) continue
    const key = repeatedSeriesKey(result.event)
    const group = groups.get(key) || []
    group.push(result.event)
    groups.set(key, group)
  }
  const repeatedUrls = new Set<string>()
  let repeatedSeriesCount = 0
  const repeatedSeriesExamples: EdgeOfNorwayRepeatedSeriesExample[] = []
  for (const group of groups.values()) {
    const dates = Array.from(new Set(group.map((event) => event.date))).sort()
    if (dates.length <= 1) continue
    repeatedSeriesCount += 1
    for (const event of group) repeatedUrls.add(event.sourceUrl)
    if (repeatedSeriesExamples.length < 10) {
      repeatedSeriesExamples.push({
        title: group[0].title,
        venueName: group[0].venueName,
        startTime: group[0].startTime,
        dates,
        sourceUrls: Array.from(new Set(group.map((event) => event.sourceUrl))),
      })
    }
  }
  const filteredResults: EventParseResult[] = results.map((result) => result.accepted && repeatedUrls.has(result.event.sourceUrl) ? { accepted: false, reason: 'repeated_series', title: result.event.title, sourceUrl: result.event.sourceUrl } : result)
  return { results: filteredResults, repeatedSeriesCount, repeatedSeriesEventsCount: repeatedUrls.size, repeatedSeriesExamples }
}

function publicAcceptedEvent(event: AcceptedSeriesCandidate): EdgeOfNorwayAcceptedEvent {
  return { title: event.title, sourceUrl: event.sourceUrl, date: event.date, startTime: event.startTime, allDay: event.allDay }
}

function parseStructuredEvent(eventObject: StructuredEvent): EventParseResult {
  const title = typeof eventObject.locTitle?.en === 'string' ? eventObject.locTitle.en.trim() : ''
  const sourceUrl = sourceUrlForSlug(eventObject.locSlug?.en?.current)
  if (!title) return { accepted: false, reason: 'missing_title', sourceUrl: sourceUrl || undefined }
  if (!sourceUrl) return { accepted: false, reason: 'missing_source_url', title }
  if (eventObject.event?.recurring === true || eventObject.event?.recurringShowings != null) return { accepted: false, reason: 'recurring_event', title, sourceUrl }
  if (/(^|[^a-z])exhibition([^a-z]|$)/i.test(title)) return { accepted: false, reason: 'exhibition_or_continuous', title, sourceUrl }
  const showings = eventObject.event?.showings
  if (!Array.isArray(showings) || showings.length === 0) return { accepted: false, reason: 'unclear_date', title, sourceUrl }
  const dates = new Set<string>()
  for (const showing of showings) {
    if (typeof showing?.date !== 'string' || !isoDatePattern.test(showing.date)) return { accepted: false, reason: 'unclear_date', title, sourceUrl }
    dates.add(showing.date)
  }
  if (showings.length !== 1 || dates.size !== 1) return { accepted: false, reason: 'multiple_dates', title, sourceUrl }
  const time = parseTime(showings[0].schedule)
  if (!time.accepted) return { accepted: false, reason: time.reason, title, sourceUrl }
  return { accepted: true, event: { title, sourceUrl, date: showings[0].date as string, startTime: time.startTime, allDay: time.allDay, venueName: venueNameForEvent(eventObject), shortDescription: shortDescriptionForEvent(eventObject) } }
}

export function parseEdgeOfNorwayListPage(html: string, _pageUrl = EDGE_OF_NORWAY_EVENTS_URL): EdgeOfNorwayListParseResult {
  const decoded = decodeFlightPayload(html)
  const extracted = extractStructuredEvents(decoded.flightText)
  const parsedResults = extracted.uniqueEvents.map(parseStructuredEvent)
  const series = splitRepeatedSeriesCandidates(parsedResults)
  const results = series.results
  const skippedCounts: Record<string, number> = {}
  for (const result of results) if (!result.accepted) skippedCounts[result.reason] = (skippedCounts[result.reason] || 0) + 1
  return {
    flightScriptsFound: decoded.flightScriptsFound,
    flightChunksDecoded: decoded.flightChunksDecoded,
    malformedChunks: decoded.malformedChunks,
    eventObjectsFound: extracted.eventObjectsFound,
    uniqueEvents: extracted.uniqueEvents.length,
    acceptedCount: results.filter((result) => result.accepted).length,
    skippedCounts,
    repeatedSeriesCount: series.repeatedSeriesCount,
    repeatedSeriesEventsCount: series.repeatedSeriesEventsCount,
    repeatedSeriesExamples: series.repeatedSeriesExamples,
    results: results.map((result) => result.accepted ? { accepted: true, event: publicAcceptedEvent(result.event) } : result),
    parsingErrors: [...decoded.parsingErrors, ...extracted.parsingErrors].slice(0, 10),
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

function diagnosticError(stage: EdgeOfNorwayDiagnosticError['stage'], error: unknown): EdgeOfNorwayDiagnosticError {
  const record = error as { name?: unknown; code?: unknown; message?: unknown; requestedUrl?: unknown; finalUrl?: unknown }
  return { stage, message: typeof record?.message === 'string' && record.message ? record.message : stage, ...(typeof record?.name === 'string' ? { name: record.name } : {}), ...(typeof record?.code === 'string' ? { code: record.code } : {}), ...(typeof record?.requestedUrl === 'string' ? { requestedUrl: record.requestedUrl } : {}), ...(typeof record?.finalUrl === 'string' ? { finalUrl: record.finalUrl } : {}) }
}

function structuredDiagnosticError(stage: EdgeOfNorwayDiagnosticError['stage'], error: unknown, fetchMeta?: EdgeOfNorwayFetchDiagnostic): EdgeOfNorwayDiagnosticResult {
  const diagnostic = diagnosticError(stage, error)
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_EVENTS_URL, flightScriptsFound: 0, flightChunksDecoded: 0, malformedChunks: 0, eventObjectsFound: 0, uniqueEvents: 0, acceptedCount: 0, skippedCounts: {}, acceptedEvents: [], repeatedSeriesCount: 0, repeatedSeriesEventsCount: 0, repeatedSeriesExamples: [], parsingErrors: [{ reason: diagnostic.message }], networkError: stage === 'fetch' ? diagnostic.message : undefined, error: diagnostic.message, diagnosticError: diagnostic, ...(fetchMeta ? { fetch: fetchMeta } : {}) }
}

function hostnameForUrl(url: string) {
  try { return new URL(url).hostname } catch { return null }
}

function isAllowedEdgeOfNorwayHostname(hostname: string | null) {
  return hostname === 'www.edgeofnorway.com' || hostname === 'edgeofnorway.com'
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400
}

function unexpectedSourceRedirect(requestedUrl: string, finalUrl: string, fetchMeta?: EdgeOfNorwayFetchDiagnostic): EdgeOfNorwayDiagnosticResult {
  return structuredDiagnosticError('fetch', { message: 'Unexpected source redirect', requestedUrl, finalUrl }, fetchMeta)
}

export async function runEdgeOfNorwayShadowDiagnostic(fetchImpl = fetch): Promise<EdgeOfNorwayDiagnosticResult> {
  return withTimeout((async () => {
    const controller = new AbortController()
    const fetchTimer = setTimeout(() => controller.abort(), 15_000)
    let listResp: Response
    try {
      listResp = await fetchImpl(EDGE_OF_NORWAY_EVENTS_URL, {
        headers: {
          'User-Agent': EDGE_OF_NORWAY_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (error) {
      return structuredDiagnosticError(controller.signal.aborted ? 'fetch' : 'fetch', error)
    } finally {
      clearTimeout(fetchTimer)
    }
    let html: string
    try {
      html = await listResp.text()
    } catch (error) {
      return structuredDiagnosticError('read_response', error)
    }
    const fetchMeta = inspectEdgeOfNorwayHtmlInput(html, EDGE_OF_NORWAY_EVENTS_URL, listResp)
    if (fetchMeta.redirectStatus || fetchMeta.redirected) return unexpectedSourceRedirect(EDGE_OF_NORWAY_EVENTS_URL, fetchMeta.finalUrl, fetchMeta)
    if (!isAllowedEdgeOfNorwayHostname(fetchMeta.finalHostname)) return unexpectedSourceRedirect(EDGE_OF_NORWAY_EVENTS_URL, fetchMeta.finalUrl, fetchMeta)
    if (!listResp.ok) return structuredDiagnosticError('fetch', new Error(`Failed to fetch list page: ${listResp.status}`), fetchMeta)
    if (fetchMeta.rawFlightMarkerCount === 0) return structuredDiagnosticError('inspect_input', new Error('No self.__next_f.push markers found in fetched HTML'), fetchMeta)
    try {
      const parsed = parseEdgeOfNorwayListPage(html, EDGE_OF_NORWAY_EVENTS_URL)
      const acceptedEvents = parsed.results.filter(isAcceptedResult).map((result) => result.event)
      const parseErrors = parsed.results.filter(isSkippedResult).map((result) => ({ title: result.title, sourceUrl: result.sourceUrl, reason: result.reason }))
      return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_EVENTS_URL, fetch: fetchMeta, flightScriptsFound: parsed.flightScriptsFound, flightChunksDecoded: parsed.flightChunksDecoded, malformedChunks: parsed.malformedChunks, eventObjectsFound: parsed.eventObjectsFound, uniqueEvents: parsed.uniqueEvents, acceptedCount: acceptedEvents.length, skippedCounts: parsed.skippedCounts, acceptedEvents, repeatedSeriesCount: parsed.repeatedSeriesCount, repeatedSeriesEventsCount: parsed.repeatedSeriesEventsCount, repeatedSeriesExamples: parsed.repeatedSeriesExamples, parsingErrors: [...parsed.parsingErrors, ...parseErrors].slice(0, 10) }
    } catch (error) {
      return structuredDiagnosticError('extract_events', error, fetchMeta)
    }
  })(), 25_000, 'timeout').catch((error) => structuredDiagnosticError('fetch', error))
}
