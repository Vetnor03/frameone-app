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
  provider: 'stavanger-friskus'
  last_fetched_at: string
  raw?: Record<string, unknown>
}

export type GetLocalEventsOptions = { municipalityNumber: string; from: Date; to: Date }

const STAVANGER_MUNICIPALITY_NUMBER = '1103'
const STAVANGER_MUNICIPALITY_UUID = 'f76ec1ae-dc3b-4291-bfb9-a4fec0c129fd'
const BASE_URL = 'https://stavanger.friskus.com'

function text(value: unknown, max = 500) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function url(value: unknown, fallbackId?: string) {
  const raw = String(value || '').trim()
  try {
    if (raw) return new URL(raw, BASE_URL).toString()
  } catch {}
  return fallbackId ? `${BASE_URL}/events/${encodeURIComponent(fallbackId)}` : `${BASE_URL}/events`
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

function category(raw: any): LocalEventCategory | null {
  const hay = text([raw?.category, raw?.category_name, raw?.activity_category, raw?.tags, raw?.title].flat().join(' '), 1000).toLowerCase()
  if (/barn|famil|ungdom|kids|children/.test(hay)) return 'children_family'
  if (/kultur|konsert|teater|kunst|museum|film|litteratur|culture/.test(hay)) return 'culture'
  if (/sport|idrett|tur|friluft|outdoor|trim|trening/.test(hay)) return 'sport_outdoor'
  return hay ? 'other' : null
}

function pickArray(json: any): any[] {
  if (Array.isArray(json)) return json
  const candidates = [json?.events, json?.data?.events, json?.data?.activities, json?.activities, json?.items, json?.data?.items]
  for (const c of candidates) if (Array.isArray(c)) return c
  return []
}

function normalize(rows: any[], fetchedAt: string, from: Date, to: Date) {
  return rows.flatMap((raw) => {
    const title = text(raw?.title ?? raw?.name ?? raw?.summary, 160)
    const startsAt = dateValue(raw?.starts_at, raw?.start_at, raw?.startTime, raw?.start_time, raw?.startDate, raw?.start_date, raw?.date)
    if (!title || !startsAt) return []
    const start = new Date(startsAt)
    if (start < from || start > to) return []
    const venue = raw?.venue ?? raw?.location ?? raw?.place ?? raw?.address
    const location = text(typeof venue === 'object' ? (venue?.name ?? venue?.title ?? venue?.address) : venue, 140) || null
    const id = eventId(raw, title, location, startsAt)
    return [{
      external_id: id,
      title,
      starts_at: startsAt,
      ends_at: dateValue(raw?.ends_at, raw?.end_at, raw?.endTime, raw?.end_time, raw?.endDate, raw?.end_date),
      location,
      short_description: text(raw?.short_description ?? raw?.description ?? raw?.body, 280) || null,
      category: category(raw),
      source_url: url(raw?.url ?? raw?.canonical_url ?? raw?.path, String(raw?.id ?? raw?.uuid ?? '').trim() || undefined),
      municipality_number: STAVANGER_MUNICIPALITY_NUMBER,
      source: 'friskus' as const,
      provider: 'stavanger-friskus' as const,
      last_fetched_at: fetchedAt,
      raw,
    }]
  })
}

async function fetchJsonEndpoint(from: Date, to: Date) {
  const params = new URLSearchParams({ municipality_id: STAVANGER_MUNICIPALITY_UUID, from: from.toISOString(), to: to.toISOString() })
  const candidates = [`${BASE_URL}/api/events?${params}`, `${BASE_URL}/api/v1/events?${params}`, `${BASE_URL}/events.json?${params}`]
  for (const endpoint of candidates) {
    try {
      const resp = await fetch(endpoint, { headers: { accept: 'application/json' }, next: { revalidate: 60 * 60 } })
      if (!resp.ok) continue
      const json = await resp.json()
      const rows = pickArray(json)
      if (rows.length) return rows
    } catch {}
  }
  return []
}

async function fetchHtmlJsonLd() {
  const page = `${BASE_URL}/events?filters=global_filters_municipalities%28EQ%29${STAVANGER_MUNICIPALITY_UUID}%24%24true`
  const resp = await fetch(page, { headers: { accept: 'text/html' }, next: { revalidate: 60 * 60 } })
  if (!resp.ok) throw new Error(`Friskus returned ${resp.status}`)
  const html = await resp.text()
  const out: any[] = []
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1] || '{}')
      const arr = Array.isArray(parsed) ? parsed : parsed?.['@graph'] || [parsed]
      out.push(...arr.filter((x: any) => String(x?.['@type'] || '').toLowerCase().includes('event')))
    } catch {}
  }
  return out
}

export async function getLocalEvents({ municipalityNumber, from, to }: GetLocalEventsOptions): Promise<NormalizedLocalEvent[]> {
  if (municipalityNumber !== STAVANGER_MUNICIPALITY_NUMBER) return []
  const fetchedAt = new Date().toISOString()
  let rows = await fetchJsonEndpoint(from, to)
  if (!rows.length) rows = await fetchHtmlJsonLd()
  return normalize(rows, fetchedAt, from, to).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
