import { DEFAULT_LOCAL_EVENT_AREA, buildEdgeOfNorwayEventsUrlForPlaceIds, getLocalEventAreaKeysForSourceLocation, normalizeLocalEventAreaPreference, uniqueLocalEventSourceLocationsForArea, type LocalEventAreaKey, type LocalEventAreaPreference } from './places.ts'

export const EDGE_OF_NORWAY_PROVIDER = 'edge-of-norway' as const
export const EDGE_OF_NORWAY_MODE = 'shadow' as const

export function buildEdgeOfNorwayEventsUrl(preference: LocalEventAreaPreference | null = DEFAULT_LOCAL_EVENT_AREA) {
  return buildEdgeOfNorwayEventsUrlForPlaceIds((preference || DEFAULT_LOCAL_EVENT_AREA).includedPlaceIds)
}

export const EDGE_OF_NORWAY_EVENTS_URL = buildEdgeOfNorwayEventsUrl(DEFAULT_LOCAL_EVENT_AREA)
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
  externalId: string
  title: string
  sourceUrl: string
  date: string
  startTime: string | null
  allDay: boolean
  sourceLocation: string | null
  areaKey: LocalEventAreaKey | null
  areaKeys: LocalEventAreaKey[]
}

export type EdgeOfNorwayRepeatedSeriesExample = {
  title: string
  venueName: string | null
  startTime: string | null
  dates: string[]
  sourceUrls: string[]
}

type SeriesCandidateMetadata = { externalId: string; venueName: string | null; shortDescription: string }
type AcceptedSeriesCandidate = Omit<EdgeOfNorwayAcceptedEvent, 'sourceLocation' | 'areaKey' | 'areaKeys'> & SeriesCandidateMetadata

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
  developmentReport?: EdgeOfNorwayDevelopmentReport
}

export type EdgeOfNorwayDevelopmentReport = {
  areas: Array<{ areaKey: LocalEventAreaKey; requestedSourceLocations: string[]; fetchedEventsPerSourceLocation: Record<string, number>; totalAfterDeduplication: number }>
  unassignedSourceLocations: string[]
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
  const sourceLocation = event.venueName
  const publicEvent = { title: event.title, sourceUrl: event.sourceUrl, date: event.date, startTime: event.startTime, allDay: event.allDay } as EdgeOfNorwayAcceptedEvent
  Object.defineProperty(publicEvent, 'externalId', { value: event.externalId, enumerable: false })
  Object.defineProperty(publicEvent, 'sourceLocation', { value: sourceLocation, enumerable: false, writable: true })
  Object.defineProperty(publicEvent, 'areaKeys', { value: getLocalEventAreaKeysForSourceLocation(sourceLocation), enumerable: false, writable: true })
  Object.defineProperty(publicEvent, 'areaKey', { value: publicEvent.areaKeys[0] || null, enumerable: false, writable: true })
  return publicEvent
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
  return { accepted: true, event: { externalId: String(eventObject._id), title, sourceUrl, date: showings[0].date as string, startTime: time.startTime, allDay: time.allDay, venueName: venueNameForEvent(eventObject), shortDescription: shortDescriptionForEvent(eventObject) } }
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

function structuredDiagnosticError(stage: EdgeOfNorwayDiagnosticError['stage'], error: unknown, fetchMeta?: EdgeOfNorwayFetchDiagnostic, listPageUrl = EDGE_OF_NORWAY_EVENTS_URL): EdgeOfNorwayDiagnosticResult {
  const diagnostic = diagnosticError(stage, error)
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl, flightScriptsFound: 0, flightChunksDecoded: 0, malformedChunks: 0, eventObjectsFound: 0, uniqueEvents: 0, acceptedCount: 0, skippedCounts: {}, acceptedEvents: [], repeatedSeriesCount: 0, repeatedSeriesEventsCount: 0, repeatedSeriesExamples: [], parsingErrors: [{ reason: diagnostic.message }], networkError: stage === 'fetch' ? diagnostic.message : undefined, error: diagnostic.message, diagnosticError: diagnostic, ...(fetchMeta ? { fetch: fetchMeta } : {}) }
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

async function fetchEdgeOfNorwayHtml(fetchImpl: typeof fetch, listPageUrl: string): Promise<{ html: string; fetchMeta: EdgeOfNorwayFetchDiagnostic }> {
  const response = await withTimeout(fetchImpl(listPageUrl, { headers: { 'User-Agent': EDGE_OF_NORWAY_USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, cache: 'no-store', redirect: 'manual' }), 20000, 'timeout')
  const html = await withTimeout(response.text(), 10000, 'timeout')
  return { html, fetchMeta: inspectEdgeOfNorwayHtmlInput(html, listPageUrl, response) }
}

function dedupeAcceptedEvents(events: EdgeOfNorwayAcceptedEvent[]) {
  const byKey = new Map<string, EdgeOfNorwayAcceptedEvent>()
  for (const event of events) {
    const key = `${event.externalId || event.sourceUrl}|${event.sourceUrl}|${event.date}|${event.startTime || 'all-day'}`
    const existing = byKey.get(key)
    if (!existing) byKey.set(key, { ...event, areaKeys: Array.from(new Set(event.areaKeys || (event.areaKey ? [event.areaKey] : []))) })
    else {
      const areaKeys = Array.from(new Set([...(existing.areaKeys || (existing.areaKey ? [existing.areaKey] : [])), ...(event.areaKeys || (event.areaKey ? [event.areaKey] : []))]))
      byKey.set(key, { ...(!existing.sourceLocation && event.sourceLocation ? event : existing), areaKeys, areaKey: existing.areaKey || event.areaKey || areaKeys[0] || null })
    }
  }
  return Array.from(byKey.values())
}

function emptyDiagnostic(listPageUrl: string, developmentReport: EdgeOfNorwayDevelopmentReport): EdgeOfNorwayDiagnosticResult {
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl, flightScriptsFound: 0, flightChunksDecoded: 0, malformedChunks: 0, eventObjectsFound: 0, uniqueEvents: 0, acceptedCount: 0, skippedCounts: {}, acceptedEvents: [], repeatedSeriesCount: 0, repeatedSeriesEventsCount: 0, repeatedSeriesExamples: [], parsingErrors: [], developmentReport }
}

export async function runEdgeOfNorwayShadowDiagnostic(fetchImpl = fetch, areaPreference?: unknown): Promise<EdgeOfNorwayDiagnosticResult> {
  const area = normalizeLocalEventAreaPreference(areaPreference) || DEFAULT_LOCAL_EVENT_AREA
  const sourceLocations = uniqueLocalEventSourceLocationsForArea(area.primaryPlaceId)
  const listPageUrl = buildEdgeOfNorwayEventsUrl(area)
  const fetchedEventsPerSourceLocation: Record<string, number> = {}
  const allAccepted: EdgeOfNorwayAcceptedEvent[] = []
  const unassigned = new Set<string>()
  const totals = { flightScriptsFound: 0, flightChunksDecoded: 0, malformedChunks: 0, eventObjectsFound: 0, uniqueEvents: 0, repeatedSeriesCount: 0, repeatedSeriesEventsCount: 0 }
  const skippedCounts: Record<string, number> = {}
  const parsingErrors: Array<{ title?: string; sourceUrl?: string; reason: string }> = []
  const repeatedSeriesExamples: EdgeOfNorwayRepeatedSeriesExample[] = []
  let firstFetch: EdgeOfNorwayFetchDiagnostic | undefined

  let fetched: { html: string; fetchMeta: EdgeOfNorwayFetchDiagnostic }
  try {
    fetched = await fetchEdgeOfNorwayHtml(fetchImpl, listPageUrl)
  } catch (error) {
    return structuredDiagnosticError('fetch', error, undefined, listPageUrl)
  }
  const { html, fetchMeta } = fetched
  if (!fetchMeta.ok) return structuredDiagnosticError('fetch', new Error(`Edge of Norway returned ${fetchMeta.status}`), fetchMeta, listPageUrl)
  if (!isAllowedEdgeOfNorwayHostname(fetchMeta.finalHostname)) return unexpectedSourceRedirect(listPageUrl, fetchMeta.finalUrl, fetchMeta)
  firstFetch = fetchMeta

  const parsed = parseEdgeOfNorwayListPage(html, listPageUrl)
  if (fetchMeta.rawFlightMarkerCount === 0 && parsed.acceptedCount === 0) {
    return structuredDiagnosticError('inspect_input', new Error('No structured Edge of Norway flight data found'), fetchMeta, listPageUrl)
  }
  for (const location of sourceLocations) fetchedEventsPerSourceLocation[location.label] = 0
  const acceptedForArea = parsed.results.filter(isAcceptedResult).map((result) => {
    const sourceLocation = result.event.sourceLocation
    const sourceAreaKeys = getLocalEventAreaKeysForSourceLocation(sourceLocation)
    if (sourceLocation && sourceAreaKeys.length === 0) unassigned.add(sourceLocation)
    const areaKeys = sourceAreaKeys.length ? sourceAreaKeys : [area.primaryPlaceId]
    if (sourceLocation) fetchedEventsPerSourceLocation[sourceLocation] = (fetchedEventsPerSourceLocation[sourceLocation] || 0) + 1
    return { ...result.event, externalId: result.event.externalId, sourceLocation, areaKeys, areaKey: areaKeys[0] || area.primaryPlaceId }
  })
  allAccepted.push(...acceptedForArea)
  totals.flightScriptsFound += parsed.flightScriptsFound
  totals.flightChunksDecoded += parsed.flightChunksDecoded
  totals.malformedChunks += parsed.malformedChunks
  totals.eventObjectsFound += parsed.eventObjectsFound
  totals.uniqueEvents += parsed.uniqueEvents
  totals.repeatedSeriesCount += parsed.repeatedSeriesCount
  totals.repeatedSeriesEventsCount += parsed.repeatedSeriesEventsCount
  for (const [key, count] of Object.entries(parsed.skippedCounts)) skippedCounts[key] = (skippedCounts[key] || 0) + count
  parsingErrors.push(...parsed.parsingErrors)
  repeatedSeriesExamples.push(...parsed.repeatedSeriesExamples)

  const acceptedEvents = dedupeAcceptedEvents(allAccepted).filter((event) => event.areaKeys.includes(area.primaryPlaceId) || event.areaKey === area.primaryPlaceId)
  const developmentReport: EdgeOfNorwayDevelopmentReport = {
    areas: [{ areaKey: area.primaryPlaceId, requestedSourceLocations: sourceLocations.map((location) => location.label), fetchedEventsPerSourceLocation, totalAfterDeduplication: acceptedEvents.length }],
    unassignedSourceLocations: Array.from(unassigned).sort(),
  }
  if (!sourceLocations.length) return emptyDiagnostic(listPageUrl, developmentReport)
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl, fetch: firstFetch, ...totals, acceptedCount: acceptedEvents.length, skippedCounts, acceptedEvents, repeatedSeriesCount: totals.repeatedSeriesCount, repeatedSeriesEventsCount: totals.repeatedSeriesEventsCount, repeatedSeriesExamples: repeatedSeriesExamples.slice(0, 10), parsingErrors: parsingErrors.slice(0, 10), developmentReport }
}
