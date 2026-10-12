import type { EventCandidate } from './nationwide'
import type { LocalEventAreaPreference } from './places'
import { distanceKm } from './nationwide.ts'

export type ExtraSource = Exclude<EventCandidate['source'], 'ticketmaster'>
export type ExtraSourceState = 'ok' | 'failed' | 'not_configured'

type SourceResult = {
  events: EventCandidate[]
  states: Record<ExtraSource, ExtraSourceState>
  errors: Partial<Record<ExtraSource, string>>
}

type SourceConfiguration = {
  url: string
  headers?: Record<string, string>
  coordinates?: { latitude: number; longitude: number } | null
}

const extraSources: ExtraSource[] = ['tikkio', 'billetto', 'friskus', 'ticketco']
const sourceHosts: Record<ExtraSource, readonly string[]> = {
  tikkio: ['tikkio.com'],
  billetto: ['billetto.com', 'billetto.no', 'billetto.dk', 'billetto.se'],
  friskus: ['friskus.com'],
  ticketco: ['ticketco.events', 'ticketco.io', 'ticketco.net'],
}

/** Only server-configured source URLs are accepted: no user-controllable URL fetching / SSRF. */
export function validateProviderUrl(source: ExtraSource, input: string) {
  const parsed = new URL(input)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hash) throw new Error('Invalid source URL')
  if (!sourceHosts[source].some((host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) {
    throw new Error('Source URL does not belong to ' + source)
  }
  return parsed.toString()
}

function optionalHeader(key: string | undefined, value: string | undefined) {
  if (!key || !value) return undefined
  if (!/^[a-zA-Z][a-zA-Z0-9-]{0,60}$/.test(key) || /[\r\n]/.test(value)) throw new Error('Invalid source authorization header')
  return { [key]: value }
}

function parsedConfigs(env: NodeJS.ProcessEnv) {
  const configs: Record<ExtraSource, SourceConfiguration[]> = {
    tikkio: [],
    billetto: [],
    friskus: [],
    ticketco: [],
  }
  const singles: Array<{ source: ExtraSource; url?: string; header?: string; value?: string }> = [
    { source: 'tikkio', url: env.TIKKIO_DISCOVERY_FEED_URL, header: env.TIKKIO_DISCOVERY_AUTH_HEADER, value: env.TIKKIO_DISCOVERY_AUTH_VALUE },
    { source: 'billetto', url: env.BILLETTO_PUBLIC_EVENTS_URL, header: env.BILLETTO_PUBLIC_EVENTS_AUTH_HEADER, value: env.BILLETTO_PUBLIC_EVENTS_AUTH_VALUE },
    { source: 'ticketco', url: env.TICKETCO_EVENTS_FEED_URL, header: env.TICKETCO_EVENTS_AUTH_HEADER, value: env.TICKETCO_EVENTS_AUTH_VALUE },
  ]
  for (const config of singles) {
    if (!config.url?.trim()) continue
    configs[config.source].push({
      url: validateProviderUrl(config.source, config.url.trim()),
      headers: optionalHeader(config.header, config.value),
    })
  }
  // Public Event Search: documented route is /api/v3/public/events.
  // Documentation uses billetto.dk; use the Norwegian domain for the Norwegian pilot,
  // and allow the verified provider endpoint to be overridden in configuration.
  // Api-Keypair value must be supplied as the complete header value provided by Billetto.
  if (env.BILLETTO_API_KEYPAIR?.trim()) {
    const keypair = env.BILLETTO_API_KEYPAIR.trim()
    if (/[\r\n]/.test(keypair)) throw new Error('Invalid Billetto Api-Keypair header')
    const url = validateProviderUrl('billetto', env.BILLETTO_PUBLIC_EVENTS_URL?.trim() || 'https://billetto.no/api/v3/public/events?limit=100')
    configs.billetto = [{
      url,
      headers: { 'Api-Keypair': keypair },
    }]
  }
  if (env.FRISKUS_RSS_FEEDS_JSON?.trim()) {
    const parsed: unknown = JSON.parse(env.FRISKUS_RSS_FEEDS_JSON)
    if (!Array.isArray(parsed) || parsed.length > 12) throw new Error('Invalid Friskus RSS feed configuration')
    for (const item of parsed) {
      const record = item as Record<string, unknown>
      if (!record || typeof record.url !== 'string') throw new Error('Invalid Friskus RSS feed URL')
      const lat = Number(record.latitude), lon = Number(record.longitude)
      configs.friskus.push({
        url: validateProviderUrl('friskus', record.url),
        coordinates: Number.isFinite(lat) && Number.isFinite(lon) && lat >= 57 && lat <= 81 && lon >= -11 && lon <= 36
          ? { latitude: lat, longitude: lon } : null,
      })
    }
  }
  return configs
}

const esc: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity.startsWith('#')) {
      const cp = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    }
    return esc[entity] || ''
  })
}
function xmlValue(xml: string, tag: string) {
  // The tags are constants owned by this parser, never user input.
  const match = xml.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '\\s*>', 'i'))
  return match ? decodeXml(match[1]).trim() : ''
}
function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function n(value: unknown) { return value == null || value === '' ? NaN : Number(value) }

export function eventLocalDateTime(value: unknown): { date: string; time: string | null } | null {
  const raw = text(value)
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/)
  if (match) {
    if (match[3]) {
      const date = new Date(raw)
      if (Number.isFinite(date.getTime())) {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
        const byType = Object.fromEntries(parts.map(p => [p.type, p.value]))
        return { date: byType.year + '-' + byType.month + '-' + byType.day, time: byType.hour + ':' + byType.minute }
      }
    }
    return { date: match[1], time: match[2] || null }
  }
  return null
}

function validUrl(raw: string) {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : null
  } catch { return null }
}
type RawItem = Record<string, unknown>
function arrayFromResponse(payload: unknown): RawItem[] {
  if (Array.isArray(payload)) return payload.map(obj)
  const outer = obj(payload)
  for (const key of ['events', 'results', 'items', 'data']) {
    const value = outer[key]
    if (Array.isArray(value)) return value.map(obj)
    if (key === 'data' && value && typeof value === 'object') {
      const inner = obj(value)
      for (const key2 of ['events', 'results', 'items']) if (Array.isArray(inner[key2])) return (inner[key2] as unknown[]).map(obj)
    }
  }
  throw new Error('Unrecognized JSON event feed format')
}

/** Parse only events with a verifiable date, link, and coordinate; never assign a guessed city. */
export function parseSourceJson(source: ExtraSource, payload: unknown, area: LocalEventAreaPreference, fallback?: SourceConfiguration['coordinates']) {
  const events: EventCandidate[] = []
  for (const item of arrayFromResponse(payload)) {
    const attrs = obj(item.attributes)
    const raw = Object.keys(attrs).length ? { ...item, ...attrs } : item
    const location = obj(raw.location)
    const place = obj(raw.place)
    const venue = obj(raw.venue)
    const venueLocation = obj(venue.location)
    const locationCoordinates = obj(location.coordinates)
    const start = obj(raw.start)
    const dateTime = eventLocalDateTime(raw.startDateTime ?? raw.start_date_time ?? raw.start_datetime ?? raw.startDate ?? raw.startdate ?? raw.start_date ?? raw.starts_at ?? start.dateTime ?? raw.date)
    const lat = [raw.latitude, raw.lat, location.latitude, location.lat, locationCoordinates.latitude, locationCoordinates.lat, place.latitude, venue.latitude, venueLocation.latitude, fallback?.latitude].map(n).find(Number.isFinite)
    const lon = [raw.longitude, raw.lng, raw.lon, location.longitude, location.lng, locationCoordinates.longitude, locationCoordinates.lng, place.longitude, venue.longitude, venueLocation.longitude, fallback?.longitude].map(n).find(Number.isFinite)
    const url = validUrl(text(raw.url || raw.eventUrl || raw.event_url || raw.ticketUrl || raw.ticket_url || raw.public_url))
    const title = text(raw.title || raw.name)
    if (source === 'billetto') {
      // The Billetto Public Event Search is scoped to a Billetto organisation / country.
      const country = text(location.country_code || location.countryCode).toUpperCase()
      if (country && country !== 'NO') continue
      // Billetto API terms disallow retaining public events after they have occurred.
      const state = text(raw.state).toLowerCase()
      if (state && state !== 'published') continue
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      if (dateTime && dateTime.date < today) continue
    }
    if (!dateTime || !url || !title || lat == null || lon == null) continue
    const distance = distanceKm(area.latitude!, area.longitude!, lat, lon)
    if (distance > (area.radiusKm || 25)) continue
    const id = text(raw.id || raw.external_id || raw.uuid) || url
    events.push({
      externalId: source + ':' + id,
      title,
      date: dateTime.date,
      startTime: dateTime.time,
      allDay: !dateTime.time,
      sourceUrl: url,
      source,
      venue: text(venue.name || location.location_name || location.city || place.name || raw.venueName || raw.locationName) || null,
      latitude: lat,
      longitude: lon,
      distanceKm: Math.round(distance * 10) / 10,
      sourceLinks: [{ source, url }],
    })
  }
  return events
}

export function parseFriskusRss(xml: string, area: LocalEventAreaPreference, fallback?: SourceConfiguration['coordinates']) {
  if (!/<(?:rss|rdf:RDF|feed)(?:\s|>)/i.test(xml)) throw new Error('Unrecognized RSS feed format')
  const blocks = Array.from(xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi), item => item[1]).slice(0, 500)
  const records: RawItem[] = []
  for (const block of blocks) {
    const title = xmlValue(block, 'title')
    const url = xmlValue(block, 'link') || xmlValue(block, 'guid')
    // pubDate is publication time, not the activity start. Never turn publish dates into events.
    const startDate = xmlValue(block, 'event:startDate') || xmlValue(block, 'startDate') || xmlValue(block, 'start_date') ||
      xmlValue(block, 'dtstart') || xmlValue(block, 'dc:date') || xmlValue(block, 'eventDate')
    const point = xmlValue(block, 'georss:point').split(/\s+/)
    const latitude = xmlValue(block, 'geo:lat') || point[0]
    const longitude = xmlValue(block, 'geo:long') || point[1]
    records.push({ title, url, startDate, latitude, longitude, venueName: xmlValue(block, 'event:location') })
  }
  return parseSourceJson('friskus', { events: records }, area, fallback)
}

export async function fetchAdditionalEvents(
  area: LocalEventAreaPreference,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SourceResult> {
  const config = parsedConfigs(env)
  const result: SourceResult = { events: [], errors: {}, states: { tikkio: 'not_configured', billetto: 'not_configured', friskus: 'not_configured', ticketco: 'not_configured' } }
  const sources = extraSources.filter(source => config[source].length)
  // Independent sources: one bad feed must not block Ticketmaster or another provider.
  await Promise.all(sources.map(async (source) => {
    let failures = 0
    const allEvents: EventCandidate[] = []
    for (const feed of config[source]) {
      try {
        const response = await fetchImpl(feed.url, {
          headers: { Accept: source === 'friskus' ? 'application/rss+xml, application/xml' : 'application/json', ...feed.headers },
          next: { revalidate: 21600 },
          redirect: 'error',
          signal: AbortSignal.timeout(12000),
        } as RequestInit)
        if (!response.ok) throw new Error(source + ' returned HTTP ' + response.status)
        const payloadText = await response.text()
        if (payloadText.length > 5_000_000) throw new Error('Feed too large')
        if (source === 'friskus') allEvents.push(...parseFriskusRss(payloadText, area, feed.coordinates))
        else allEvents.push(...parseSourceJson(source, JSON.parse(payloadText), area, feed.coordinates))
      } catch (error) {
        failures += 1
        result.errors[source] = error instanceof Error ? error.message : 'Source unavailable'
      }
    }
    // Any failed feed means we must not prune previously stored events for that provider.
    result.states[source] = failures ? 'failed' : 'ok'
    result.events.push(...allEvents)
  }))
  return result
}
