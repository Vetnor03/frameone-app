import type { LocalEventAreaPreference } from './places'

/**
 * Ticketmaster Discovery adapter for the nationwide Events pilot.
 * Keep credentials server-side. Other providers will implement the same EventCandidate contract
 * when their documented feeds and reuse permissions have been verified.
 */
export type EventCandidate = {
  externalId: string
  title: string
  date: string
  startTime: string | null
  allDay: boolean
  sourceUrl: string
  source: 'ticketmaster' | 'tikkio' | 'billetto' | 'friskus' | 'ticketco'
  venue: string | null
  latitude: number
  longitude: number
  distanceKm: number
}

export const PLANNED_EVENT_SOURCES = ['ticketmaster', 'tikkio', 'billetto', 'friskus', 'ticketco'] as const

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180
  const latDelta = (lat2 - lat1) * radians
  const lonDelta = (lon2 - lon1) * radians
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(lonDelta / 2) ** 2
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Ticketmaster officially recommends geoPoint rather than deprecated latlong. */
export function encodeGeoHash(latitude: number, longitude: number, precision = 7) {
  const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz'
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180
  let even = true, bits = 0, character = 0, result = ''
  while (result.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2
      if (longitude >= mid) { character = character * 2 + 1; lonMin = mid } else { character *= 2; lonMax = mid }
    } else {
      const mid = (latMin + latMax) / 2
      if (latitude >= mid) { character = character * 2 + 1; latMin = mid } else { character *= 2; latMax = mid }
    }
    even = !even
    bits += 1
    if (bits === 5) { result += alphabet[character]; character = 0; bits = 0 }
  }
  return result
}

export function deduplicateEvents(events: EventCandidate[]) {
  const seen = new Set<string>()
  return events
    .filter((event) => {
      const title = event.title.normalize('NFKC').toLocaleLowerCase('nb-NO').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const place = event.venue?.normalize('NFKC').toLocaleLowerCase('nb-NO').trim() || `${event.latitude.toFixed(2)}:${event.longitude.toFixed(2)}`
      const key = [title, event.date, place].join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
}

type TicketmasterEvent = {
  id?: string; name?: string; url?: string
  dates?: { start?: { localDate?: string; localTime?: string } }
  _embedded?: { venues?: Array<{ name?: string; location?: { latitude?: string; longitude?: string } }> }
}
type TicketmasterResponse = {
  _embedded?: { events?: TicketmasterEvent[] }
  page?: { totalPages?: number }
}

export function parseTicketmasterEvents(payload: TicketmasterResponse, latitude: number, longitude: number, radiusKm: number) {
  const result: EventCandidate[] = []
  for (const item of payload._embedded?.events || []) {
    const venue = item._embedded?.venues?.[0]
    const eventLat = Number(venue?.location?.latitude)
    const eventLon = Number(venue?.location?.longitude)
    const date = item.dates?.start?.localDate || ''
    const sourceUrl = item.url || ''
    if (!item.id || !item.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(eventLat) || !Number.isFinite(eventLon)) continue
    if (!/^https:\/\//i.test(sourceUrl)) continue
    const distance = distanceKm(latitude, longitude, eventLat, eventLon)
    if (distance > radiusKm) continue
    const time = item.dates?.start?.localTime?.slice(0, 5) || null
    result.push({
      externalId: 'ticketmaster:' + item.id,
      title: item.name.trim(),
      date,
      startTime: /^\d{2}:\d{2}$/.test(time || '') ? time : null,
      allDay: !time,
      sourceUrl,
      source: 'ticketmaster',
      venue: venue?.name || null,
      latitude: eventLat,
      longitude: eventLon,
      distanceKm: Math.round(distance * 10) / 10,
    })
  }
  return result
}

export async function fetchNationwideEvents(
  area: LocalEventAreaPreference,
  fetchImpl: typeof fetch = fetch,
  apiKey = process.env.TICKETMASTER_DISCOVERY_API_KEY,
) {
  if (typeof area.latitude !== 'number' || typeof area.longitude !== 'number') {
    throw new Error('Choose a Norwegian place before syncing Events.')
  }
  if (!apiKey) throw new Error('Ticketmaster API key is not configured. No national event source is active.')
  const radiusKm = area.radiusKm || 25
  const base = new URL('https://app.ticketmaster.com/discovery/v2/events.json')
  base.searchParams.set('apikey', apiKey)
  base.searchParams.set('countryCode', 'NO')
  base.searchParams.set('geoPoint', encodeGeoHash(area.latitude, area.longitude))
  base.searchParams.set('radius', String(radiusKm))
  base.searchParams.set('unit', 'km')
  base.searchParams.set('startDateTime', new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'))
  base.searchParams.set('sort', 'date,asc')
  base.searchParams.set('size', '200')
  base.searchParams.set('locale', '*')

  const all: EventCandidate[] = []
  for (let page = 0; page < 5; page += 1) {
    base.searchParams.set('page', String(page))
    const response = await fetchImpl(base.toString(), { next: { revalidate: 21600 } } as RequestInit)
    if (!response.ok) throw new Error(`Ticketmaster returned HTTP ${response.status}`)
    const payload = await response.json() as TicketmasterResponse
    all.push(...parseTicketmasterEvents(payload, area.latitude, area.longitude, radiusKm))
    if (!payload._embedded?.events?.length || page + 1 >= Math.min(payload.page?.totalPages || 1, 5)) break
  }
  return {
    acceptedEvents: deduplicateEvents(all),
    activeSources: ['ticketmaster'] as string[],
    inactiveSources: ['tikkio', 'billetto', 'friskus', 'ticketco'] as string[],
  }
}
