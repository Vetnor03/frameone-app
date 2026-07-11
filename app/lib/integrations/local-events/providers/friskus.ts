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

export class LocalEventsProviderError extends Error {
  constructor(
    message: string,
    readonly details: {
      provider: string
      municipalityNumber?: string
      providerMunicipality?: string
      requestUrl?: string
      status?: number
      statusText?: string
      contentType?: string | null
      responseBody?: string
      cause?: unknown
    },
  ) {
    super(message)
    this.name = 'LocalEventsProviderError'
  }
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message, stack: error.cause.stack } : error.cause,
    }
  }
  return { value: String(error) }
}

export type FriskusMunicipalityConfig = {
  municipalityNumber: string
  municipalityName: string
  providerMunicipality: string
  publicBaseUrl: string
}
export type GetLocalEventsOptions = { municipalityNumber: string; from: Date; to: Date }
export type LocalEventsDebugResult = {
  municipalityNumber: string
  municipalityName: string
  provider: 'friskus'
  providerMunicipality: string
  requestUrl: string
  requestSucceeded: boolean
  status?: number
  statusText?: string
  contentType: string | null
  redirected?: boolean
  finalUrl?: string
  bodyPreview?: string
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

type FriskusEventRecord = Record<string, unknown>
type FriskusEventsResponse = { data: { events: FriskusEventRecord[] }; meta?: unknown }

function text(value: unknown, max = 500) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function publicUrl(raw: any, config: FriskusMunicipalityConfig, fallbackId?: string) {
  const rawUrl = String(raw?.url ?? raw?.canonical_url ?? raw?.path ?? '').trim()
  try { if (rawUrl) return new URL(rawUrl, config.publicBaseUrl).toString() } catch {}
  const id = String(raw?.id ?? raw?.uuid ?? fallbackId ?? '').trim()
  return id ? `${config.publicBaseUrl}/events/${encodeURIComponent(id)}` : `${config.publicBaseUrl}/events`
}

function stableId(providerMunicipality: string, title: string, location: string | null, startsAt: string) {
  return `friskus:${crypto.createHash('sha256').update(`friskus|${providerMunicipality}|${title}|${location || ''}|${startsAt}`).digest('hex').slice(0, 24)}`
}

function eventId(raw: any, config: FriskusMunicipalityConfig, title: string, location: string | null, startsAt: string) {
  const id = text(raw?.id ?? raw?.uuid ?? raw?.slug ?? raw?._id, 120)
  return id ? `friskus:${config.providerMunicipality}:${id}` : stableId(config.providerMunicipality, title, location, startsAt)
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

export function startOfTodayInOslo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+02:00`)
}

export function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d }
export function endOfDayInOslo(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return new Date(`${get('year')}-${get('month')}-${get('day')}T23:59:59.999+02:00`)
}

function category(raw: any): LocalEventCategory | null {
  const hay = text([raw?.category, raw?.category_name, raw?.activity_category, raw?.tags, raw?.title, raw?.name].flat().join(' '), 1000).toLowerCase()
  if (/barn|famil|ungdom|kids|children/.test(hay)) return 'children_family'
  if (/kultur|konsert|teater|kunst|museum|film|litteratur|culture/.test(hay)) return 'culture'
  if (/sport|idrett|tur|friluft|outdoor|trim|trening/.test(hay)) return 'sport_outdoor'
  return hay ? 'other' : null
}

function parseFriskusEventsResponse(json: unknown): FriskusEventsResponse {
  const body = json as FriskusEventsResponse
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object' && Array.isArray(body.data.events)) return body
  throw new LocalEventsProviderError('Unexpected Friskus response shape; expected data.events array', { provider: 'friskus' })
}

export function extractRows(json: unknown): FriskusEventRecord[] { return parseFriskusEventsResponse(json).data.events }

function occurrenceCandidates(raw: any) {
  const direct = [{ startsAt: dateValue(raw?.starts_at, raw?.start_at, raw?.startTime, raw?.start_time, raw?.startDate, raw?.start_date, raw?.date, raw?.next_occurrence_at), endsAt: dateValue(raw?.ends_at, raw?.end_at, raw?.endTime, raw?.end_time, raw?.endDate, raw?.end_date) }]
  const occurrences = Array.isArray(raw?.occurrences) ? raw.occurrences : Array.isArray(raw?.dates) ? raw.dates : []
  return direct.concat(occurrences.map((o: any) => ({ startsAt: dateValue(o?.starts_at, o?.start_at, o?.start, o?.date), endsAt: dateValue(o?.ends_at, o?.end_at, o?.end) })))
}

function normalizeRaw(raw: any, fetchedAt: string, config: FriskusMunicipalityConfig, from: Date, to: Date): NormalizedLocalEvent | null {
  const title = text(raw?.title ?? raw?.name ?? raw?.summary, 160)
  if (!title) return null
  const occurrence = occurrenceCandidates(raw)
    .filter((o) => o.startsAt)
    .find((o) => new Date(o.endsAt || o.startsAt || 0) >= from && new Date(o.startsAt || 0) <= to)
  const startsAt = occurrence?.startsAt || null
  if (!startsAt) return null
  const venue = raw?.venue ?? raw?.location ?? raw?.place ?? raw?.address
  const location = text(typeof venue === 'object' ? (venue?.name ?? venue?.title ?? venue?.address ?? venue?.formatted_address) : venue, 140) || null
  const sourceUrl = publicUrl(raw, config)
  try { new URL(sourceUrl) } catch { return null }
  return { external_id: eventId(raw, config, title, location, startsAt), title, starts_at: startsAt, ends_at: occurrence?.endsAt || null, location, short_description: text(raw?.short_description ?? raw?.description ?? raw?.body, 280) || null, category: category(raw), source_url: sourceUrl, municipality_number: config.municipalityNumber, source: 'friskus', provider: 'friskus', last_fetched_at: fetchedAt, raw }
}

function passesDateFilter(raw: any, from: Date, to: Date) {
  return occurrenceCandidates(raw).some((o) => {
    if (!o.startsAt) return false
    const effectiveEnd = new Date(o.endsAt || o.startsAt)
    const eventStart = new Date(o.startsAt)
    return effectiveEnd >= from && eventStart <= to
  })
}

export function normalizeFriskusEvents(rows: FriskusEventRecord[], fetchedAt: string, from: Date, to: Date, config: FriskusMunicipalityConfig) {
  let missingTitle = 0; let invalidDate = 0
  const dateFiltered = rows.filter((row) => passesDateFilter(row, from, to))
  const normalized = dateFiltered.flatMap((row: any) => {
    if (!text(row?.title ?? row?.name ?? row?.summary, 160)) { missingTitle++; return [] }
    if (!occurrenceCandidates(row).some((o) => o.startsAt)) { invalidDate++; return [] }
    const event = normalizeRaw(row, fetchedAt, config, from, to)
    return event ? [event] : []
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  return { dateFiltered, normalized, diagnostics: { removedMissingTitle: missingTitle, removedInvalidDate: invalidDate, removedByDate: rows.length - dateFiltered.length } }
}

export function friskusEventsEndpoint(config: FriskusMunicipalityConfig) {
  const params = new URLSearchParams({ municipality: config.providerMunicipality })
  return `https://api.friskus.com/api/v1/events?${params.toString()}`
}

async function fetchFriskusRows(config: FriskusMunicipalityConfig) {
  const requestUrl = friskusEventsEndpoint(config)
  const fetchOptions: RequestInit = { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'RE-MIND/1.0 local-events integration' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) }
  let resp: Response
  try { resp = await fetch(requestUrl, fetchOptions) } catch (error) {
    console.error('[local-events] Friskus network request failed', { municipalityNumber: config.municipalityNumber, providerMunicipality: config.providerMunicipality, requestUrl, error: serializeError(error) })
    throw new LocalEventsProviderError('Friskus network request failed', { provider: 'friskus', municipalityNumber: config.municipalityNumber, providerMunicipality: config.providerMunicipality, requestUrl, cause: error })
  }
  const contentType = resp.headers.get('content-type')
  const body = await resp.text()
  const baseDiagnostics = { municipalityNumber: config.municipalityNumber, providerMunicipality: config.providerMunicipality, requestUrl, status: resp.status, statusText: resp.statusText, redirected: resp.redirected, finalUrl: resp.url, contentType, bodyPreview: body.slice(0, 1000) }
  console.info('[local-events] Friskus response', baseDiagnostics)
  if (!resp.ok) throw new LocalEventsProviderError(`Friskus returned ${resp.status} ${resp.statusText}`, { provider: 'friskus', municipalityNumber: config.municipalityNumber, providerMunicipality: config.providerMunicipality, requestUrl, status: resp.status, statusText: resp.statusText, contentType, responseBody: body.slice(0, 1000) })
  let json: unknown
  try { json = JSON.parse(body) } catch (error) { throw new LocalEventsProviderError('Friskus returned invalid JSON', { provider: 'friskus', municipalityNumber: config.municipalityNumber, providerMunicipality: config.providerMunicipality, requestUrl, status: resp.status, statusText: resp.statusText, contentType, responseBody: body.slice(0, 1000), cause: error }) }
  const rows = extractRows(json)
  console.info('[local-events] Friskus raw events', { ...baseDiagnostics, rawCount: rows.length, sampleRawEvent: rows[0] || null })
  return { rows, status: resp.status, statusText: resp.statusText, contentType, requestUrl, finalUrl: resp.url, redirected: resp.redirected, bodyPreview: body.slice(0, 1000) }
}

export async function getLocalEvents({ municipalityNumber, from }: GetLocalEventsOptions): Promise<NormalizedLocalEvent[]> {
  const config = FRISKUS_MUNICIPALITIES[municipalityNumber]
  if (!config) throw new Error('Unsupported municipality')
  const rangeStart = startOfTodayInOslo(from)
  const rangeEnd = endOfDayInOslo(addDays(rangeStart, 14))
  const { rows } = await fetchFriskusRows(config)
  const { dateFiltered, normalized, diagnostics } = normalizeFriskusEvents(rows, new Date().toISOString(), rangeStart, rangeEnd, config)
  console.info('[local-events] Friskus normalization diagnostics', { municipalityNumber, providerMunicipality: config.providerMunicipality, rawCount: rows.length, normalizedRecordCount: normalized.length, recordsRemovedDueToMissingTitle: diagnostics.removedMissingTitle, recordsRemovedDueToInvalidDate: diagnostics.removedInvalidDate, recordsRemovedByUpcomingDateWindow: diagnostics.removedByDate, sampleRawRecord: rows[0] || null, sampleNormalizedRecord: normalized[0] || null })
  return normalized
}

export async function debugLocalEvents(municipalityNumber: string, from = new Date()): Promise<LocalEventsDebugResult> {
  const config = FRISKUS_MUNICIPALITIES[municipalityNumber]
  if (!config) throw new Error('Unsupported municipality')
  const rangeStart = startOfTodayInOslo(from)
  const rangeEnd = endOfDayInOslo(addDays(rangeStart, 14))
  const fetchedAt = new Date().toISOString()
  const result = await fetchFriskusRows(config)
  const { dateFiltered, normalized, diagnostics } = normalizeFriskusEvents(result.rows, fetchedAt, rangeStart, rangeEnd, config)
  return { municipalityNumber: config.municipalityNumber, municipalityName: config.municipalityName, provider: 'friskus', providerMunicipality: config.providerMunicipality, requestUrl: result.requestUrl, requestSucceeded: true, status: result.status, statusText: result.statusText, contentType: result.contentType, redirected: result.redirected, finalUrl: result.finalUrl, bodyPreview: result.bodyPreview, rawCount: result.rows.length, filteredCount: dateFiltered.length, normalizedCount: normalized.length, sampleRawEvent: result.rows[0] || null, sampleNormalizedEvent: normalized[0] || null, diagnostics }
}
