export type WasteProviderKey = 'min_renovasjon' | 'stavanger' | 'sandnes' | 'hentavfall' | 'generic_ics' | 'manual'
export type WasteFraction = 'restavfall' | 'plast' | 'papir' | 'matavfall' | 'glass_metall' | 'hageavfall' | string

export type ResolvedWasteAddress = {
  addressId: string
  label: string
  municipalityNumber: string
  municipalityName: string
  streetName?: string
  houseNumber?: string
  postalCode?: string
  lat?: number
  lon?: number
  gnr?: string
  bnr?: string
  snr?: string
  propertyId?: string
  source?: 'kartverket' | 'provider_search'
}

export type WastePreviewItem = {
  date: string
  wasteTypes: string[]
  source: 'stavanger' | 'hentavfall'
  address: string
  municipality: string
  title: string
}

export type NormalizedWasteCollection = {
  date: string
  waste_fraction: WasteFraction
  title: string
  source_url?: string | null
  raw?: unknown
}

export type WasteProviderRegistryEntry = {
  municipality_number: string
  municipality_name: string
  provider: WasteProviderKey
  provider_config: Record<string, unknown>
  status: 'supported' | 'unsupported' | 'disabled'
}

export interface WasteProvider {
  key: WasteProviderKey
  resolveAddress(address: string, config?: Record<string, unknown>): Promise<ResolvedWasteAddress>
  fetchCollections(resolvedAddress: ResolvedWasteAddress, config?: Record<string, unknown>): Promise<unknown>
  normalizeCollections(rawData: unknown, config?: Record<string, unknown>): NormalizedWasteCollection[]
}

type ProviderFetchLog = {
  url: string
  status?: number
  payloadSize?: number
}

type NorconsultRawCollection = {
  date: string
  fractions: string[]
  source_url: string
  raw: unknown
}

type NorconsultRawResult = {
  provider: 'norconsult_public_calendar'
  municipality: string
  source_url: string
  fetch_log: ProviderFetchLog[]
  collections: NorconsultRawCollection[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function normalizeFraction(raw: unknown) {
  const value = asString(raw).toLowerCase()
  if (value.includes('plast')) return 'plast'
  if (value.includes('papir') || value.includes('papp')) return 'papir'
  if (value.includes('mat')) return 'matavfall'
  if (value.includes('glass') || value.includes('metall')) return 'glass_metall'
  if (value.includes('hage')) return 'hageavfall'
  return 'restavfall'
}

export function wasteCollectionTitle(fraction: WasteFraction) {
  if (fraction === 'plast') return 'Tøm plast'
  if (fraction === 'papir') return 'Tøm papir'
  if (fraction === 'matavfall') return 'Tøm matavfall'
  if (fraction === 'glass_metall') return 'Tøm glass og metall'
  if (fraction === 'hageavfall') return 'Tøm hageavfall'
  return 'Tøm restavfall'
}

function normalizeCollectionRows(rawData: unknown): NormalizedWasteCollection[] {
  const rows = Array.isArray(rawData) ? rawData : Array.isArray(asRecord(rawData).collections) ? asRecord(rawData).collections as unknown[] : []
  const seen = new Set<string>()
  const out: NormalizedWasteCollection[] = []
  for (const row of rows) {
    const r = asRecord(row)
    const date = asString(r.date) || asString(r.collection_date) || asString(r.tommedato).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const fractions = Array.isArray(r.fractions) ? r.fractions : [r.waste_fraction ?? r.fraction ?? r.type ?? r.fractionName]
    for (const fractionRaw of fractions) {
      const waste_fraction = normalizeFraction(fractionRaw)
      const key = `${date}__${waste_fraction}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ date, waste_fraction, title: wasteCollectionTitle(waste_fraction), source_url: asString(r.source_url) || null, raw: row })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export async function resolveKartverketAddress(address: string): Promise<ResolvedWasteAddress> {
  const query = address.trim()
  if (!query) throw new Error('Missing address')
  const url = new URL('https://ws.geonorge.no/adresser/v1/sok')
  url.searchParams.set('sok', query)
  url.searchParams.set('treffPerSide', '1')
  url.searchParams.set('asciiKompatibel', 'true')
  const resp = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!resp.ok) throw new Error(`Kartverket address lookup failed (${resp.status})`)
  const json = await resp.json()
  const hit = Array.isArray(json?.adresser) ? json.adresser[0] : null
  if (!hit) throw new Error('Address not found')
  const municipalityNumber = asString(hit.kommunenummer)
  const municipalityName = asString(hit.kommunenavn)
  const gnr = asString(hit.gardsnummer)
  const bnr = asString(hit.bruksnummer)
  const snr = asString(hit.seksjonsnummer) || asString(hit.festenummer) || '0'
  const addressId = asString(hit.adressekode) && asString(hit.nummer)
    ? `${municipalityNumber}-${hit.adressekode}-${hit.nummer}-${asString(hit.bokstav)}`
    : `${municipalityNumber}-${query.toLowerCase()}`
  return {
    addressId,
    label: asString(hit.adressetekst) || query,
    municipalityNumber,
    municipalityName,
    streetName: asString(hit.adressenavn),
    houseNumber: `${asString(hit.nummer)}${asString(hit.bokstav)}`.trim(),
    postalCode: asString(hit.postnummer),
    lat: Number.isFinite(Number(hit.representasjonspunkt?.lat)) ? Number(hit.representasjonspunkt.lat) : undefined,
    lon: Number.isFinite(Number(hit.representasjonspunkt?.lon)) ? Number(hit.representasjonspunkt.lon) : undefined,
    gnr: gnr || undefined,
    bnr: bnr || undefined,
    snr: snr || undefined,
    source: 'kartverket',
  }
}

async function fetchJsonOrConfiguredCollections(resolvedAddress: ResolvedWasteAddress, config: Record<string, unknown>) {
  if (Array.isArray(config.collections)) return config.collections
  const endpoint = asString(config.endpoint)
  if (!endpoint) return []
  const url = new URL(endpoint)
  url.searchParams.set('municipality_number', resolvedAddress.municipalityNumber)
  url.searchParams.set('address_id', resolvedAddress.addressId)
  if (resolvedAddress.streetName) url.searchParams.set('street_name', resolvedAddress.streetName)
  if (resolvedAddress.houseNumber) url.searchParams.set('house_number', resolvedAddress.houseNumber)
  const resp = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!resp.ok) throw new Error(`Waste provider request failed (${resp.status})`)
  return resp.json()
}

function stavangerShowUrl(resolvedAddress: ResolvedWasteAddress, config: Record<string, unknown>, municipality: string) {
  const explicit = asString(config.show_url) || asString(config.calendar_url)
  if (explicit) return explicit
  const gnr = asString(config.gnr) || resolvedAddress.gnr
  const bnr = asString(config.bnr) || resolvedAddress.bnr
  const snr = asString(config.snr) || resolvedAddress.snr || '0'
  const id = asString(config.id) || asString(config.property_id) || resolvedAddress.propertyId
  if (!gnr || !bnr || !id) return ''
  const url = new URL(municipality === 'Sandnes' ? 'https://www.hentavfall.no/rogaland/sandnes/tommekalender/show' : 'https://www.stavanger.kommune.no/renovasjon-og-miljo/tommekalender/finn-kalender/show')
  url.searchParams.set('bnumber', bnr)
  url.searchParams.set('gnumber', gnr)
  url.searchParams.set(municipality === 'Stavanger' ? 'ids' : 'id', id)
  url.searchParams.set('municipality', municipality)
  url.searchParams.set('snumber', snr)
  return url.toString()
}

function parseNorconsultCalendarHtml(html: string, sourceUrl: string): NorconsultRawCollection[] {
  const year = new Date().getFullYear()
  const rows: NorconsultRawCollection[] = []
  const rowPattern = /(\d{2})\.(\d{2})(?:\.(\d{4}))?\s*-\s*[^\n<]*([\s\S]{0,700}?)(?=\d{2}\.\d{2}(?:\.\d{4})?\s*-|Ofte stilte|Fant du|$)/g
  let match: RegExpExecArray | null
  while ((match = rowPattern.exec(html)) !== null) {
    const fractions = Array.from(new Set(Array.from(match[4].matchAll(/Image:\s*([^<\n]+)/g)).map((m) => stripTags(m[1])).filter(Boolean)))
    if (!fractions.length) continue
    const yyyy = match[3] || String(year)
    rows.push({ date: `${yyyy}-${match[2]}-${match[1]}`, fractions, source_url: sourceUrl, raw: stripTags(match[0]) })
  }
  return rows
}

async function fetchNorconsultPublicCalendar(resolvedAddress: ResolvedWasteAddress, config: Record<string, unknown>, municipality: 'Stavanger' | 'Sandnes'): Promise<NorconsultRawResult> {
  if (Array.isArray(config.collections)) {
    return { provider: 'norconsult_public_calendar', municipality, source_url: 'configured collections', fetch_log: [], collections: config.collections as NorconsultRawCollection[] }
  }
  const sourceUrl = stavangerShowUrl(resolvedAddress, config, municipality)
  if (!sourceUrl) {
    throw new Error(`${municipality} waste provider needs a public calendar URL or gnr/bnr/id in provider_config; address ${resolvedAddress.label} resolved as ${resolvedAddress.addressId}`)
  }
  const log: ProviderFetchLog[] = [{ url: sourceUrl }]
  let resp: Response
  let text = ''
  try {
    resp = await fetch(sourceUrl, { headers: { Accept: 'text/html,application/xhtml+xml' } })
    text = await resp.text()
  } catch (error: unknown) {
    throw new Error(`${municipality} waste provider request failed for ${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`)
  }
  log[0].status = resp.status
  log[0].payloadSize = text.length
  console.log('[waste] provider request', log[0])
  if (!resp.ok) throw new Error(`${municipality} waste provider returned ${resp.status} for ${sourceUrl} (${text.length} bytes)`)
  const collections = parseNorconsultCalendarHtml(text, sourceUrl).filter((row) => row.date >= new Date().toISOString().slice(0, 10))
  console.log('[waste] provider parse result', { provider: municipality.toLowerCase(), parsedCollectionCount: collections.length, first5: collections.slice(0, 5) })
  if (!collections.length) throw new Error(`${municipality} waste provider returned no parseable collection dates from ${sourceUrl} (${text.length} bytes)`)
  return { provider: 'norconsult_public_calendar', municipality, source_url: sourceUrl, fetch_log: log, collections }
}

function jsonProvider(key: WasteProviderKey): WasteProvider {
  return { key, resolveAddress: resolveKartverketAddress, fetchCollections: (a, c = {}) => fetchJsonOrConfiguredCollections(a, c), normalizeCollections: normalizeCollectionRows }
}

async function resolveNorconsultAddress(address: string, municipality: 'Stavanger' | 'Sandnes'): Promise<ResolvedWasteAddress> {
  const kartverket = await resolveKartverketAddress(address)
  const endpointBases = municipality === 'Sandnes'
    ? ['https://www.hentavfall.no/rogaland/sandnes/tommekalender']
    : ['https://www.stavanger.kommune.no/renovasjon-og-miljo/tommekalender/finn-kalender']
  const params = ['term', 'query', 'q', 'address', 'search']
  const paths = ['/search', '/address-search', '/autocomplete', '/find', '/lookup', '/suggest']
  for (const base of endpointBases) {
    for (const path of paths) {
      for (const param of params) {
        const url = new URL(`${base}${path}`)
        url.searchParams.set(param, address.trim())
        try {
          const resp = await fetch(url, { headers: { Accept: 'application/json, text/javascript, */*' } })
          if (!resp.ok) continue
          const json = await resp.json().catch(() => null)
          const candidate = pickProviderAddress(json, address)
          if (candidate) return { ...kartverket, ...candidate, source: 'provider_search' }
        } catch {
          // Try the next known endpoint shape.
        }
      }
    }
  }
  return kartverket
}

function pickProviderAddress(json: unknown, address: string): Partial<ResolvedWasteAddress> | null {
  const roots = Array.isArray(json) ? json : [json, asRecord(json).results, asRecord(json).items, asRecord(json).addresses, asRecord(json).data].flatMap((v) => Array.isArray(v) ? v : v ? [v] : [])
  for (const item of roots) {
    const r = asRecord(item)
    const gnr = asString(r.gnumber) || asString(r.gnr) || asString(r.gardsnummer)
    const bnr = asString(r.bnumber) || asString(r.bnr) || asString(r.bruksnummer)
    const snr = asString(r.snumber) || asString(r.snr) || asString(r.seksjonsnummer) || '0'
    const propertyId = asString(r.id) || asString(r.ids) || asString(r.uuid) || asString(r.propertyId) || asString(r.Guid)
    if (!gnr || !bnr || !propertyId) continue
    return {
      addressId: propertyId,
      label: asString(r.label) || asString(r.text) || asString(r.address) || address,
      gnr, bnr, snr, propertyId,
    }
  }
  return null
}

function norconsultProvider(key: 'stavanger' | 'sandnes' | 'hentavfall', municipality: 'Stavanger' | 'Sandnes'): WasteProvider {
  return {
    key,
    resolveAddress: (address) => resolveNorconsultAddress(address, municipality),
    fetchCollections: (a, c = {}) => fetchNorconsultPublicCalendar(a, c, municipality),
    normalizeCollections: normalizeCollectionRows,
  }
}

export const wasteProviders: Record<WasteProviderKey, WasteProvider> = {
  min_renovasjon: jsonProvider('min_renovasjon'),
  stavanger: norconsultProvider('stavanger', 'Stavanger'),
  sandnes: norconsultProvider('sandnes', 'Sandnes'),
  hentavfall: norconsultProvider('hentavfall', 'Sandnes'),
  generic_ics: jsonProvider('generic_ics'),
  manual: jsonProvider('manual'),
}

export function providerFor(key: string): WasteProvider | null {
  return wasteProviders[key as WasteProviderKey] || null
}
