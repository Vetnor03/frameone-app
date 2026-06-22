export type WasteProviderKey = 'min_renovasjon' | 'stavanger' | 'sandnes' | 'generic_ics' | 'manual'
export type WasteFraction = 'restavfall' | 'plast' | 'papir' | 'matavfall' | 'glass_metall' | string

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFraction(raw: unknown) {
  const value = asString(raw).toLowerCase()
  if (value.includes('plast')) return 'plast'
  if (value.includes('papir') || value.includes('papp')) return 'papir'
  if (value.includes('mat')) return 'matavfall'
  if (value.includes('glass') || value.includes('metall')) return 'glass_metall'
  return 'restavfall'
}

export function wasteCollectionTitle(fraction: WasteFraction) {
  if (fraction === 'plast') return 'Tøm plast'
  if (fraction === 'papir') return 'Tøm papir'
  if (fraction === 'matavfall') return 'Tøm matavfall'
  if (fraction === 'glass_metall') return 'Tøm glass og metall'
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
    const waste_fraction = normalizeFraction(r.waste_fraction ?? r.fraction ?? r.type ?? r.fractionName)
    const key = `${date}__${waste_fraction}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ date, waste_fraction, title: wasteCollectionTitle(waste_fraction), raw: row })
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
  if (!resp.ok) throw new Error('Kartverket address lookup failed')
  const json = await resp.json()
  const hit = Array.isArray(json?.adresser) ? json.adresser[0] : null
  if (!hit) throw new Error('Address not found')
  const municipalityNumber = asString(hit.kommunenummer)
  const municipalityName = asString(hit.kommunenavn)
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
  if (!resp.ok) throw new Error('Waste provider request failed')
  return resp.json()
}

function jsonProvider(key: WasteProviderKey): WasteProvider {
  return { key, resolveAddress: resolveKartverketAddress, fetchCollections: (a, c = {}) => fetchJsonOrConfiguredCollections(a, c), normalizeCollections: normalizeCollectionRows }
}

function notImplementedProvider(key: 'stavanger' | 'sandnes'): WasteProvider {
  return {
    key,
    resolveAddress: resolveKartverketAddress,
    async fetchCollections() {
      throw new Error('Provider supported but fetch not implemented yet')
    },
    normalizeCollections: normalizeCollectionRows,
  }
}

export const wasteProviders: Record<WasteProviderKey, WasteProvider> = {
  min_renovasjon: jsonProvider('min_renovasjon'),
  stavanger: notImplementedProvider('stavanger'),
  sandnes: notImplementedProvider('sandnes'),
  generic_ics: jsonProvider('generic_ics'),
  manual: jsonProvider('manual'),
}

export function providerFor(key: string): WasteProvider | null {
  return wasteProviders[key as WasteProviderKey] || null
}
