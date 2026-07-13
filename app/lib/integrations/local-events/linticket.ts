import { upsertDiscoveredLocalEventLocation, type LocalEventPlace } from './places.ts'

export const LINTICKET_PROVIDER = 'linticket' as const
export const LINTICKET_EVENTS_URL = 'https://www.linticket.no/api/index.php3?action=events'

type JsonRecord = Record<string, unknown>

export type NormalizedLocalEvent = {
  provider: string
  canonicalEventId: string
  providerRecordIds: Record<string, string[]>
  sourceEventId: string
  occurrenceId: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  allDay: boolean
  venue: string | null
  address: string | null
  city: string | null
  municipality: string | null
  county: string | null
  countryCode: string | null
  latitude: number | null
  longitude: number | null
  category: string | null
  organizer: string | null
  ageLimit: string | null
  price: string | null
  ticketStatus: string | null
  eventUrl: string | null
  imageUrl: string | null
  location: LocalEventPlace | null
  raw: JsonRecord
}

export type LinTicketDiagnosticResult = {
  provider: typeof LINTICKET_PROVIDER
  url: string
  fetchedAt: string
  ok: boolean
  status?: number
  eventObjectsFound: number
  acceptedCount: number
  skippedCount: number
  acceptedEvents: NormalizedLocalEvent[]
  error?: string
  diagnosticError?: { stage: 'fetch' | 'http' | 'parse' | 'payload'; message: string }
}

const stringValue = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : null
const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value.replace(',', '.')))) return Number(value.replace(',', '.'))
  return null
}
const firstString = (record: JsonRecord, keys: string[]) => keys.map((key) => stringValue(record[key])).find(Boolean) || null
const firstNumber = (record: JsonRecord, keys: string[]) => keys.map((key) => numberValue(record[key])).find((value) => value != null) ?? null

function asArray(payload: unknown): JsonRecord[] | null {
  if (Array.isArray(payload)) return payload.filter((item): item is JsonRecord => !!item && typeof item === 'object' && !Array.isArray(item))
  if (payload && typeof payload === 'object') {
    const record = payload as JsonRecord
    for (const key of ['events', 'data', 'result', 'results']) {
      if (Array.isArray(record[key])) return record[key].filter((item): item is JsonRecord => !!item && typeof item === 'object' && !Array.isArray(item))
    }
  }
  return null
}

function parseDate(value: string | null) {
  if (!value) return null
  const normalized = value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value
  const withZone = /(?:Z|[+-]\d\d:?\d\d)$/.test(normalized) ? normalized : normalized
  const date = new Date(withZone)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function sourceEventId(record: JsonRecord) {
  return firstString(record, ['id', 'event_id', 'eventId', 'arrangement_id', 'arrangementId', 'sourceEventId'])
}

function occurrenceStart(record: JsonRecord) {
  return parseDate(firstString(record, ['start', 'start_time', 'startTime', 'starts_at', 'startsAt', 'date_start', 'dateStart', 'datetime', 'date']))
}

export function normalizeLinTicketEvent(record: JsonRecord): NormalizedLocalEvent | null {
  const id = sourceEventId(record)
  const startsAt = occurrenceStart(record)
  const title = firstString(record, ['title', 'name', 'event_name', 'eventName', 'heading'])
  if (!id || !startsAt || !title) return null
  const city = firstString(record, ['city', 'place', 'sted', 'location_city', 'municipality'])
  const municipality = firstString(record, ['municipality', 'kommune']) || city
  const countryCode = (firstString(record, ['countryCode', 'country_code', 'country']) || 'NO').toUpperCase()
  if (countryCode !== 'NO' && countryCode !== 'NORWAY' && countryCode !== 'NORGE') return null
  const latitude = firstNumber(record, ['latitude', 'lat', 'venue_latitude'])
  const longitude = firstNumber(record, ['longitude', 'lng', 'lon', 'venue_longitude'])
  const venue = firstString(record, ['venue', 'venueName', 'venue_name', 'arena', 'location', 'place_name'])
  const locationName = city || municipality
  const county = firstString(record, ['county', 'fylke'])
  const location = locationName ? upsertDiscoveredLocalEventLocation({ name: locationName, municipality, county, countryCode: 'NO', latitude, longitude, source: LINTICKET_PROVIDER, nextEventAt: startsAt }) : null
  const occurrenceId = firstString(record, ['occurrence_id', 'occurrenceId', 'showing_id', 'showingId']) || `${id}:${startsAt}`
  const canonicalEventId = `${LINTICKET_PROVIDER}:${id}:${startsAt}`
  return {
    provider: LINTICKET_PROVIDER,
    canonicalEventId,
    providerRecordIds: { [LINTICKET_PROVIDER]: [id, occurrenceId].filter(Boolean) },
    sourceEventId: id,
    occurrenceId,
    title,
    description: firstString(record, ['description', 'body', 'text', 'ingress']),
    startsAt,
    endsAt: parseDate(firstString(record, ['end', 'end_time', 'endTime', 'ends_at', 'endsAt', 'date_end', 'dateEnd'])),
    allDay: Boolean(record.allDay || record.all_day) || /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || '')),
    venue,
    address: firstString(record, ['address', 'venue_address', 'street']),
    city,
    municipality,
    county,
    countryCode: 'NO',
    latitude,
    longitude,
    category: firstString(record, ['category', 'genre', 'type']),
    organizer: firstString(record, ['organizer', 'organiser', 'promoter']),
    ageLimit: firstString(record, ['ageLimit', 'age_limit', 'min_age']),
    price: firstString(record, ['price', 'price_from', 'ticket_price']),
    ticketStatus: firstString(record, ['ticketStatus', 'ticket_status', 'status']),
    eventUrl: firstString(record, ['url', 'eventUrl', 'event_url', 'link']),
    imageUrl: firstString(record, ['image', 'imageUrl', 'image_url', 'poster']),
    location,
    raw: record,
  }
}

export function parseLinTicketPayload(payload: unknown): { events: NormalizedLocalEvent[]; eventObjectsFound: number; skippedCount: number } {
  const rows = asArray(payload)
  if (!rows) throw new Error('LinTicket payload did not contain an events array')
  const events = rows.map(normalizeLinTicketEvent).filter(Boolean) as NormalizedLocalEvent[]
  return { events, eventObjectsFound: rows.length, skippedCount: rows.length - events.length }
}

export function buildLinTicketEventsUrl(appid?: string | null) {
  const url = new URL(LINTICKET_EVENTS_URL)
  if (appid) url.searchParams.set('appid', appid)
  return url.toString()
}

export async function runLinTicketDiagnostic(fetchImpl = fetch, config?: { appid?: string | null }): Promise<LinTicketDiagnosticResult> {
  const url = buildLinTicketEventsUrl(config?.appid)
  const fetchedAt = new Date().toISOString()
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json,text/json,*/*', 'User-Agent': 'REMIND-LocalEvents/1.0' }, cache: 'no-store' })
    const text = await response.text()
    if (!response.ok) throw Object.assign(new Error(`LinTicket returned ${response.status}`), { stage: 'http' })
    let payload: unknown
    try { payload = JSON.parse(text) } catch { throw Object.assign(new Error('LinTicket response was not valid JSON'), { stage: 'parse' }) }
    const parsed = parseLinTicketPayload(payload)
    return { provider: LINTICKET_PROVIDER, url, fetchedAt, ok: true, status: response.status, eventObjectsFound: parsed.eventObjectsFound, acceptedCount: parsed.events.length, skippedCount: parsed.skippedCount, acceptedEvents: parsed.events }
  } catch (error) {
    const stage = (error as any)?.stage || 'fetch'
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[local-events/linticket] provider failed', { stage, message })
    return { provider: LINTICKET_PROVIDER, url, fetchedAt, ok: false, eventObjectsFound: 0, acceptedCount: 0, skippedCount: 0, acceptedEvents: [], error: message, diagnosticError: { stage, message } }
  }
}
