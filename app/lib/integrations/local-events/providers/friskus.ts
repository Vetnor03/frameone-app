import crypto from 'node:crypto'

export type LocalEventCategory = 'children_family' | 'culture' | 'sport_outdoor' | 'other'
export type LocalEventFilter = 'all' | LocalEventCategory

export type NormalizedLocalEvent = {
  external_id: string
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  short_description: string | null
  category: LocalEventCategory | null
  source_url: string
  municipality_number: string
  source: 'friskus'
  provider: 'friskus'
  last_fetched_at: string
  raw?: Record<string, unknown>
}

export type FriskusMunicipalityConfig = {
  municipalityNumber: string
  municipalityName: string
  providerMunicipality: string
  publicBaseUrl: string
}
export type GetLocalEventsOptions = { municipalityNumber: string; from: Date; to: Date }
export type LocalEventsDebugResult = {
  municipality: string
  providerMunicipality: string
  requestSucceeded: boolean
  status: number | null
  contentType: string | null
  requestUrl: string
  rawCount: number
  filteredCount: number
  normalizedCount: number
  sampleRawEvent: unknown | null
  sampleNormalizedEvent: NormalizedLocalEvent | null
  diagnostics: Record<string, unknown>
}

export const LOCAL_EVENT_MUNICIPALITIES: Record<string, FriskusMunicipalityConfig> = {
  '1103': { municipalityNumber: '1103', municipalityName: 'Stavanger', providerMunicipality: 'stavanger', publicBaseUrl: 'https://stavanger.friskus.com' },
  '1108': { municipalityNumber: '1108', municipalityName: 'Sandnes', providerMunicipality: 'sandnes', publicBaseUrl: 'https://sandnes.friskus.com' },
}

export const FRISKUS_MUNICIPALITIES = LOCAL_EVENT_MUNICIPALITIES

function text(value: unknown, max = 500) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function publicUrl(raw: any, config: FriskusMunicipalityConfig, fallbackId?: string) {
  const rawUrl = String(raw?.url ?? raw?.canonical_url ?? raw?.path ?? '').trim()
  try { if (rawUrl) return new URL(rawUrl, config.publicBaseUrl).toString() } catch {}
  const id = String(raw?.id ?? raw?.uuid ?? fallbackId ?? '').trim()
  return id ? `${config.publicBaseUrl}/events/${encodeURIComponent(id)}` : `${config.publicBaseUrl}/events`
}

function stableId(title: string, location: string | null, startsAt: string) {
  return `friskus:${crypto.createHash('sha256').update(`${title}|${location || ''}|${startsAt}`).digest('hex').slice(0, 24)}`
}

function eventId(raw: any, title: string, location: string | null, startsAt: string) {
  const id = text(raw?.id ?? raw?.uuid ?? raw?.slug ?? raw?._id, 120)
  return id ? `friskus:${id}` : stableId(title, location, startsAt)
}

function dateValue(...values: unknown[]) {
  for (const value of values) {
    const raw = String(value || '').trim()
    if (!raw) continue
    const d = new Date(raw)
    if (Number.isFinite(d.getTime())) return d.toISOString()
  }
  return null
}

function startOfTodayOslo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+02:00`)
}

function category(raw: any): LocalEventCategory | null {
  const hay = text([raw?.category, raw?.category_name, raw?.activity_category, raw?.tags, raw?.title, raw?.name].flat().join(' '), 1000).toLowerCase()
  if (/barn|famil|ungdom|kids|children/.test(hay)) return 'children_family'
  if (/kultur|konsert|teater|kunst|museum|film|litteratur|culture/.test(hay)) return 'culture'
  if (/sport|idrett|tur|friluft|outdoor|trim|trening/.test(hay)) return 'sport_outdoor'
  return hay ? 'other' : null
}

function extractRows(json: any): any[] {
  const rows = json?.data?.events
  if (Array.isArray(rows)) return rows
  throw new Error(`Unexpected Friskus response shape; expected data.events array, got keys: ${Object.keys(json || {}).join(', ')}`)
}

function normalizeRaw(raw: any, fetchedAt: string, config: FriskusMunicipalityConfig): NormalizedLocalEvent | null {
  const title = text(raw?.title ?? raw?.name ?? raw?.summary, 160)
  const startsAt = dateValue(raw?.starts_at, raw?.start_at, raw?.startTime, raw?.start_time, raw?.startDate, raw?.start_date, raw?.date, raw?.next_occurrence_at)
  if (!title || !startsAt) return null
  const venue = raw?.venue ?? raw?.location ?? raw?.place ?? raw?.address
  const location = text(typeof venue === 'object' ? (venue?.name ?? venue?.title ?? venue?.address ?? venue?.formatted_address) : venue, 140) || null
  return {
    external_id: eventId(raw, title, location, startsAt),
    title,
    starts_at: startsAt,
    ends_at: dateValue(raw?.ends_at, raw?.end_at, raw?.endTime, raw?.end_time, raw?.endDate, raw?.end_date),
    location,
    short_description: text(raw?.short_description ?? raw?.description ?? raw?.body, 280) || null,
    category: category(raw),
    source_url: publicUrl(raw, config),
    municipality_number: config.municipalityNumber,
    source: 'friskus',
    provider: 'friskus',
    last_fetched_at: fetchedAt,
    raw,
  }
}

function passesDateFilter(raw: any, from: Date, to: Date) {
  const start = dateValue(raw?.starts_at, raw?.start_at, raw?.startTime, raw?.start_time, raw?.startDate, raw?.start_date, raw?.date, raw?.next_occurrence_at)
  const end = dateValue(raw?.ends_at, raw?.end_at, raw?.endTime, raw?.end_time, raw?.endDate, raw?.end_date) || start
  if (!start || !end) return false
  const eventEnd = new Date(end)
  const eventStart = new Date(start)
  return eventEnd >= from && eventStart <= to
}

export function normalizeFriskusEvents(rows: any[], fetchedAt: string, from: Date, to: Date, config: FriskusMunicipalityConfig) {
  const dateFiltered = rows.filter((row) => passesDateFilter(row, from, to))
  const normalized = dateFiltered.flatMap((row) => {
    const event = normalizeRaw(row, fetchedAt, config)
    return event ? [event] : []
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  return { dateFiltered, normalized }
}

function endpoint(config: FriskusMunicipalityConfig, from: Date, to: Date) {
  const params = new URLSearchParams({ municipality: config.providerMunicipality, from: from.toISOString(), to: to.toISOString() })
  return `https://api.friskus.com/api/v1/events?${params.toString()}`
}

async function fetchFriskusRows(config: FriskusMunicipalityConfig, from: Date, to: Date) {
  const requestUrl = endpoint(config, from, to)
  const resp = await fetch(requestUrl, { headers: { accept: 'application/json' }, next: { revalidate: 60 * 30 } })
  const contentType = resp.headers.get('content-type')
  const body = await resp.text()
  const baseDiagnostics = { requestUrl, municipalityNumber: config.municipalityNumber, providerMunicipality: config.providerMunicipality, status: resp.status, contentType, bodyPreview: body.slice(0, 500) }
  if (!resp.ok) {
    console.error('[local-events] Friskus request failed', baseDiagnostics)
    throw new Error('Could not load local events')
  }
  let json: unknown
  try { json = JSON.parse(body) } catch (error) {
    console.error('[local-events] Friskus JSON parse failed', { ...baseDiagnostics, error })
    throw new Error('Could not load local events')
  }
  const rows = extractRows(json)
  console.log('[local-events] Friskus request diagnostics', { ...baseDiagnostics, rawCount: rows.length })
  return { rows, status: resp.status, contentType, requestUrl, bodyPreview: body.slice(0, 500) }
}

export async function getLocalEvents({ municipalityNumber, from, to }: GetLocalEventsOptions): Promise<NormalizedLocalEvent[]> {
  const config = FRISKUS_MUNICIPALITIES[municipalityNumber]
  if (!config) throw new Error('Unsupported municipality')
  const osloToday = startOfTodayOslo(from)
  const { rows } = await fetchFriskusRows(config, osloToday, to)
  const { dateFiltered, normalized } = normalizeFriskusEvents(rows, new Date().toISOString(), osloToday, to, config)
  console.log('[local-events] Friskus normalization diagnostics', { municipalityNumber, providerMunicipality: config.providerMunicipality, rawCount: rows.length, afterDateFiltering: dateFiltered.length, afterNormalization: normalized.length })
  return normalized
}

export async function debugLocalEvents(municipalityNumber: string, from = new Date(), to = new Date(Date.now() + 14 * 86400000)): Promise<LocalEventsDebugResult> {
  const config = FRISKUS_MUNICIPALITIES[municipalityNumber]
  if (!config) throw new Error('Unsupported municipality')
  const osloToday = startOfTodayOslo(from)
  const fetchedAt = new Date().toISOString()
  const result = await fetchFriskusRows(config, osloToday, to)
  const { dateFiltered, normalized } = normalizeFriskusEvents(result.rows, fetchedAt, osloToday, to, config)
  return { municipality: config.municipalityName, providerMunicipality: config.providerMunicipality, requestSucceeded: true, status: result.status, contentType: result.contentType, requestUrl: result.requestUrl, rawCount: result.rows.length, filteredCount: dateFiltered.length, normalizedCount: normalized.length, sampleRawEvent: result.rows[0] || null, sampleNormalizedEvent: normalized[0] || null, diagnostics: { bodyPreview: result.bodyPreview, municipalityNumber, removedByDate: result.rows.length - dateFiltered.length, removedByNormalization: dateFiltered.length - normalized.length } }
}
