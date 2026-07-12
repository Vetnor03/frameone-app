export const EDGE_OF_NORWAY_PROVIDER = 'edge-of-norway' as const
export const EDGE_OF_NORWAY_MODE = 'shadow' as const
export const EDGE_OF_NORWAY_STAVANGER_LIST_URL = 'https://www.fjordnorway.com/en/events?date=next_30&filtertype=place&place=stavanger'
export const EDGE_OF_NORWAY_USER_AGENT = 'RE:MIND local-events shadow diagnostics (no persistence; contact hello@remind.no)'

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
  | 'unclear_time'
  | 'multiple_times'

export type EdgeOfNorwayAcceptedEvent = {
  title: string
  sourceUrl: string
  date: string
  startTime: string | null
  allDay: boolean
}

type EventParseResult =
  | { accepted: true; event: EdgeOfNorwayAcceptedEvent }
  | { accepted: false; reason: EdgeOfNorwaySkipReason; title?: string; sourceUrl?: string }

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
  parsingErrors: Array<{ title?: string; sourceUrl?: string; reason: string }>
  networkError?: string
  error?: string
}

type FlightDecodeResult = { flightText: string; flightScriptsFound: number; flightChunksDecoded: number; malformedChunks: number; parsingErrors: Array<{ reason: string }> }

type StructuredEvent = {
  _id?: unknown
  _type?: unknown
  locTitle?: { en?: unknown }
  locSlug?: { en?: { current?: unknown } }
  event?: {
    _type?: unknown
    recurring?: unknown
    recurringShowings?: unknown
    showings?: Array<{ date?: unknown; schedule?: Array<{ hour?: unknown; minutes?: unknown }> }>
  }
}

const eventObjectMarker = '"data"'
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

function scriptTexts(html: string) {
  return Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).map((match) => match[1])
}

function decodeFlightPayload(html: string): FlightDecodeResult {
  const result: FlightDecodeResult = { flightText: '', flightScriptsFound: 0, flightChunksDecoded: 0, malformedChunks: 0, parsingErrors: [] }
  for (const text of scriptTexts(html)) {
    if (!text.includes('self.__next_f.push(')) continue
    result.flightScriptsFound += 1
    for (const match of text.matchAll(/self\.__next_f\.push\(([\s\S]*?)\)\s*;?/g)) {
      try {
        const parsed = JSON.parse(match[1])
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
    }
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

function parseTime(schedule: unknown): { accepted: true; startTime: string | null; allDay: boolean } | { accepted: false; reason: EdgeOfNorwaySkipReason } {
  if (!Array.isArray(schedule) || schedule.length === 0) return { accepted: true, startTime: null, allDay: true }
  const times = new Set<string>()
  for (const entry of schedule) {
    const hour = (entry as { hour?: unknown })?.hour
    const minutes = (entry as { minutes?: unknown })?.minutes
    if (typeof hour !== 'number' || typeof minutes !== 'number' || !Number.isInteger(hour) || !Number.isInteger(minutes) || hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return { accepted: false, reason: 'unclear_time' }
    times.add(`${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
  }
  if (times.size > 1) return { accepted: false, reason: 'multiple_times' }
  return { accepted: true, startTime: Array.from(times)[0], allDay: false }
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
  return { accepted: true, event: { title, sourceUrl, date: showings[0].date as string, startTime: time.startTime, allDay: time.allDay } }
}

export function parseEdgeOfNorwayListPage(html: string, _pageUrl = EDGE_OF_NORWAY_STAVANGER_LIST_URL) {
  const decoded = decodeFlightPayload(html)
  const extracted = extractStructuredEvents(decoded.flightText)
  const results = extracted.uniqueEvents.map(parseStructuredEvent)
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
    results,
    parsingErrors: [...decoded.parsingErrors, ...extracted.parsingErrors].slice(0, 10),
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

function structuredDiagnosticError(reason: EdgeOfNorwaySkipReason, error: unknown): EdgeOfNorwayDiagnosticResult {
  const message = error instanceof Error && error.message ? error.message : reason
  return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_STAVANGER_LIST_URL, flightScriptsFound: 0, flightChunksDecoded: 0, malformedChunks: 0, eventObjectsFound: 0, uniqueEvents: 0, acceptedCount: 0, skippedCounts: { [reason]: 1 }, acceptedEvents: [], parsingErrors: [{ reason, title: message }], networkError: reason === 'fetch_failed' || reason === 'timeout' ? message : undefined, error: message }
}

export async function runEdgeOfNorwayShadowDiagnostic(fetchImpl = fetch): Promise<EdgeOfNorwayDiagnosticResult> {
  return withTimeout((async () => {
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
    try {
      const parsed = parseEdgeOfNorwayListPage(await listResp.text(), EDGE_OF_NORWAY_STAVANGER_LIST_URL)
      const acceptedEvents = parsed.results.filter((result) => result.accepted).map((result) => result.event)
      const parseErrors = parsed.results.filter((result) => !result.accepted).map((result) => ({ title: result.title, sourceUrl: result.sourceUrl, reason: result.reason }))
      return { provider: EDGE_OF_NORWAY_PROVIDER, mode: EDGE_OF_NORWAY_MODE, listPageUrl: EDGE_OF_NORWAY_STAVANGER_LIST_URL, flightScriptsFound: parsed.flightScriptsFound, flightChunksDecoded: parsed.flightChunksDecoded, malformedChunks: parsed.malformedChunks, eventObjectsFound: parsed.eventObjectsFound, uniqueEvents: parsed.uniqueEvents, acceptedCount: acceptedEvents.length, skippedCounts: parsed.skippedCounts, acceptedEvents, parsingErrors: [...parsed.parsingErrors, ...parseErrors].slice(0, 10) }
    } catch (error) {
      return structuredDiagnosticError('parser_failed', error)
    }
  })(), 25_000, 'timeout').catch((error) => structuredDiagnosticError(error instanceof Error && error.message === 'timeout' ? 'timeout' : 'parser_failed', error))
}
