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
  fnr?: string
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

type ProviderAddressCandidate = Partial<ResolvedWasteAddress> & {
  matchScore: number
  raw?: unknown
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
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
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
  const fnr = asString(hit.festenummer)
  const snr = asString(hit.seksjonsnummer) || '0'
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
    fnr: fnr || undefined,
    snr,
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
  const id = asString(config.id) || asString(config.property_id) || resolvedAddress.propertyId || temporaryProviderUuidFallback(resolvedAddress, municipality)
  if (!gnr || !bnr || !id) return ''
  const url = new URL(municipality === 'Sandnes' ? 'https://www.hentavfall.no/rogaland/sandnes/tommekalender/show' : 'https://www.stavanger.kommune.no/renovasjon-og-miljo/tommekalender/finn-kalender/show')
  url.searchParams.set('bnumber', bnr)
  url.searchParams.set('gnumber', gnr)
  url.searchParams.set(municipality === 'Stavanger' ? 'ids' : 'id', id)
  url.searchParams.set('municipality', municipality === 'Sandnes' ? 'Sandnes kommune' : municipality)
  url.searchParams.set('snumber', snr)
  return url.toString()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aring;/gi, 'å')
    .replace(/&aelig;/gi, 'æ')
    .replace(/&oslash;/gi, 'ø')
    .replace(/&Aring;/g, 'Å')
    .replace(/&AElig;/g, 'Æ')
    .replace(/&Oslash;/g, 'Ø')
}

function normalizeFingerprintText(value: string) {
  return decodeHtmlEntities(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9/_.:-]+/g, ' ').trim()
}

function parseHtmlAttrs(tag: string) {
  const attrs: Record<string, string> = {}
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[3] ?? match[4] ?? match[5] ?? '')
  }
  return attrs
}

function iconFingerprintsFromHtml(html: string) {
  const fingerprints = new Set<string>()
  const add = (kind: string, value: string) => {
    const normalized = normalizeFingerprintText(value)
    if (normalized) fingerprints.add(`${kind}:${normalized}`)
  }
  for (const match of html.matchAll(/<(img|svg|use)\b[^>]*>(?:[\s\S]*?<\/\1>)?/gi)) {
    const tagHtml = match[0]
    const attrs = parseHtmlAttrs(tagHtml)
    for (const name of ['src', 'data-src', 'href', 'xlink:href', 'alt', 'title', 'aria-label', 'class']) add(name, attrs[name] || '')
    if (attrs.src || attrs['data-src'] || attrs.href || attrs['xlink:href']) {
      const url = attrs.src || attrs['data-src'] || attrs.href || attrs['xlink:href']
      add('file', url.split(/[?#]/)[0].split('/').pop() || url)
    }
    add('html', tagHtml.replace(/\s+/g, ' '))
  }
  return Array.from(fingerprints)
}

function wasteLabelFromText(value: string) {
  const text = normalizeFingerprintText(stripTags(value))
  if (!text) return ''
  if (text.includes('matavfall') || /\bmat\b/.test(text)) return 'Matavfall'
  if (text.includes('hageavfall') || /\bhage\b/.test(text)) return 'Hageavfall'
  if (text.includes('plastemballasje') || /\bplast\b/.test(text)) return 'Plastemballasje'
  if (text.includes('papiravfall') || text.includes('papp og papir') || text.includes('papp/papir') || /\bpapir\b/.test(text) || /\bpapp\b/.test(text)) return 'Papiravfall'
  if (text.includes('restavfall') || /\brest\b/.test(text)) return 'Restavfall'
  if (text.includes('glass') || text.includes('metall')) return 'Glass og metall'
  return ''
}

function parseNorconsultLegend(html: string) {
  const legend = new Map<string, string>()
  const blocks = Array.from(html.matchAll(/<(?:li|tr|div|p|span|dd|dt)\b[^>]*>[\s\S]{0,1200}?(?:<\/(?:li|tr|div|p|span|dd|dt)>)/gi), (m) => m[0])
  for (const block of blocks) {
    const label = wasteLabelFromText(block)
    if (!label) continue
    const fps = iconFingerprintsFromHtml(block)
    for (const fp of fps) legend.set(fp, label)
  }
  return legend
}

function yearForNorconsultDate(day: string, month: string, explicitYear?: string) {
  if (explicitYear) return explicitYear
  const now = new Date()
  const currentYear = now.getFullYear()
  const candidate = new Date(Date.UTC(currentYear, Number(month) - 1, Number(day)))
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  // Calendars may cross New Year; a date more than two months behind today belongs to next year.
  if (candidate.getTime() < today.getTime() - 62 * 24 * 60 * 60 * 1000) return String(currentYear + 1)
  return String(currentYear)
}

function htmlCells(rowHtml: string) {
  return Array.from(rowHtml.matchAll(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi), (m) => m[0])
}

function iconHtmlForCalendarRow(rowHtml: string, datePattern: RegExp) {
  const cells = htmlCells(rowHtml)
  if (!cells.length) return rowHtml
  const dateIndex = cells.findIndex((cell) => datePattern.test(stripTags(cell)))
  if (dateIndex < 0) return rowHtml
  const afterDateCells = cells.slice(dateIndex + 1)
  const iconCells = afterDateCells.filter((cell) => /<(?:img|svg|use)\b/i.test(cell))
  return (iconCells.length ? iconCells : afterDateCells).join(' ')
}

function containersAroundDates(html: string, datePattern: RegExp) {
  const blocks: string[] = []
  const seen = new Set<string>()
  const add = (block: string) => {
    const key = block.slice(0, 80) + block.length + block.slice(-80)
    if (!seen.has(key) && datePattern.test(stripTags(block))) {
      seen.add(key)
      blocks.push(block)
    }
  }

  for (const match of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) add(match[0])
  for (const match of html.matchAll(/<(?:li|article|section)\b[^>]*>[\s\S]{0,3000}?<\/(?:li|article|section)>/gi)) add(match[0])
  if (blocks.length) return blocks
  const dateMatches = Array.from(html.matchAll(/\d{2}\.\d{2}(?:\.\d{4})?\s*-\s*[a-zæøå]+/gi))
  for (let i = 0; i < dateMatches.length; i += 1) {
    const match = dateMatches[i]
    const index = match.index ?? 0
    const before = html.lastIndexOf('<div', index)
    const after = html.indexOf('</div>', index)
    if (before >= 0 && after > index && after - before < 3000) add(html.slice(before, after + 6))
    else {
      const nextIndex = dateMatches[i + 1]?.index ?? html.length
      add(html.slice(index, Math.min(html.length, nextIndex)))
    }
  }
  return blocks
}

function parseNorconsultCalendarHtml(html: string, sourceUrl: string): NorconsultRawCollection[] {
  const rows: NorconsultRawCollection[] = []
  const legend = parseNorconsultLegend(html)
  const datePattern = /(\d{2})\.(\d{2})(?:\.(\d{4}))?\s*-\s*[a-zæøå]+/i
  const rowBlocks = containersAroundDates(html, datePattern)
  let dateRowsFound = 0
  const debugRows: Array<{ dateText: string; rowHtml: string; rowIconFingerprints: string[]; matchedWasteTypes: string[] }> = []
  for (const chunk of rowBlocks) {
    const text = stripTags(chunk)
    const match = text.match(datePattern)
    if (!match) continue
    dateRowsFound += 1
    const iconHtml = iconHtmlForCalendarRow(chunk, datePattern)
    const fallbackFractions = Array.from(new Set(Array.from(iconHtml.matchAll(/Image:\s*([^<\n]+)/g)).map((m) => stripTags(m[1])).filter(Boolean)))
    const rowFingerprints = iconFingerprintsFromHtml(iconHtml)
    const matched = new Set<string>(fallbackFractions)
    for (const fp of rowFingerprints) {
      const wasteType = legend.get(fp)
      if (wasteType) matched.add(wasteType)
    }
    if (!matched.size) {
      const label = wasteLabelFromText(iconHtml)
      if (label) matched.add(label)
    }
    const fractions = Array.from(matched)
    debugRows.push({ dateText: match[0], rowHtml: chunk.slice(0, 1500), rowIconFingerprints: rowFingerprints.slice(0, 25), matchedWasteTypes: fractions })
    if (!fractions.length) continue
    const yyyy = yearForNorconsultDate(match[1], match[2], match[3])
    rows.push({ date: `${yyyy}-${match[2]}-${match[1]}`, fractions, source_url: sourceUrl, raw: stripTags(chunk) })
  }
  console.log('[waste] calendar parser debug', {
    sourceUrl,
    htmlLength: html.length,
    dateRowsFound,
    legendEntriesFound: legend.size,
    legendFingerprints: Array.from(legend.keys()).slice(0, 25),
    rows: debugRows.slice(0, 10),
    finalReminderCount: rows.reduce((sum, row) => sum + row.fractions.length, 0),
  })
  return rows
}

async function fetchNorconsultPublicCalendar(resolvedAddress: ResolvedWasteAddress, config: Record<string, unknown>, municipality: 'Stavanger' | 'Sandnes'): Promise<NorconsultRawResult> {
  if (Array.isArray(config.collections)) {
    return { provider: 'norconsult_public_calendar', municipality, source_url: 'configured collections', fetch_log: [], collections: config.collections as NorconsultRawCollection[] }
  }
  const sourceUrl = stavangerShowUrl(resolvedAddress, config, municipality)
  if (!sourceUrl) {
    console.log(`[waste] starting ${municipality} provider UUID lookup`, {
      label: resolvedAddress.label,
      gnr: resolvedAddress.gnr || null,
      bnr: resolvedAddress.bnr || null,
      snr: resolvedAddress.snr || '0',
      propertyId: resolvedAddress.propertyId || null,
    })
    throw new Error(`${municipality} waste provider could not resolve provider UUID for ${resolvedAddress.label}; resolved matrikkel ${resolvedAddress.gnr || '?'} / ${resolvedAddress.bnr || '?'} / ${resolvedAddress.snr || '0'}`)
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
  console.log(`[waste] provider UUID lookup limited to known temporary fallbacks`, {
    provider: municipality.toLowerCase(),
    searchQuery: address.trim(),
    label: kartverket.label,
    gnr: kartverket.gnr || null,
    bnr: kartverket.bnr || null,
    snr: kartverket.snr || '0',
  })
  const fallbackId = temporaryProviderUuidFallback(kartverket, municipality)
  if (fallbackId) {
    console.log('[waste] temporary provider UUID fallback matched', {
      provider: municipality.toLowerCase(),
      gnr: kartverket.gnr,
      bnr: kartverket.bnr,
      snr: kartverket.snr || '0',
      propertyId: fallbackId,
    })
    return { ...kartverket, addressId: fallbackId, propertyId: fallbackId, source: 'provider_search' }
  }
  return kartverket
}

function temporaryProviderUuidFallback(resolvedAddress: ResolvedWasteAddress, municipality: string) {
  const snr = resolvedAddress.snr || '0'
  if (municipality === 'Stavanger' && resolvedAddress.gnr === '16' && resolvedAddress.bnr === '489' && snr === '0') {
    return '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b'
  }
  if (municipality === 'Sandnes' && resolvedAddress.gnr === '70' && resolvedAddress.bnr === '152' && snr === '0') {
    return '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7'
  }
  return ''
}


function providerLookupUrls(endpointBases: string[], address: string, kartverket: ResolvedWasteAddress, municipality: 'Stavanger' | 'Sandnes') {
  const urls: string[] = []
  const paths = [
    '/search', '/address-search', '/autocomplete', '/find', '/lookup', '/suggest',
    '/Search', '/GetAddresses', '/getaddresses', '/GetAddress', '/AddressSearch',
    '/FindAddress', '/findaddress', '/FindAddresses', '/findaddresses', '/SearchAddresses',
    '/api/search', '/api/address-search', '/api/addresses', '/api/tommekalender/addresses',
  ]
  const textParams = ['term', 'query', 'q', 'address', 'search', 'searchText', 'adresse', 'text', 'filter']
  const add = (raw: string, params: Record<string, string | undefined>) => {
    const url = new URL(raw)
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value)
    urls.push(url.toString())
  }
  for (const base of endpointBases) {
    for (const path of paths) for (const param of textParams) add(`${base}${path}`, { [param]: address.trim() })
    for (const path of paths) add(`${base}${path}`, {
      municipality,
      municipalityNumber: kartverket.municipalityNumber,
      kommunenummer: kartverket.municipalityNumber,
      gnumber: kartverket.gnr,
      bnumber: kartverket.bnr,
      snumber: kartverket.snr || '0',
      festenumber: kartverket.fnr || '0',
    })
  }
  return Array.from(new Set(urls))
}

function flattenProviderCandidates(value: unknown, depth = 0): unknown[] {
  if (depth > 5 || value == null) return []
  if (typeof value === 'string') {
    const rows: unknown[] = []
    for (const match of value.matchAll(/\{[^{}]*(?:id|ids|uuid|propertyId|gnumber|gardsnummer|bnumber|bruksnummer)[^{}]*\}/gi)) {
      try { rows.push(JSON.parse(match[0])) } catch {}
    }
    return rows
  }
  if (Array.isArray(value)) return value.flatMap((item) => [item, ...flattenProviderCandidates(item, depth + 1)])
  const record = asRecord(value)
  return [record, ...Object.values(record).flatMap((item) => flattenProviderCandidates(item, depth + 1))]
}
function safeJsonParse(value: string): unknown | null {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

function normalizeAddressText(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function field(record: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const exact = asString(record[name])
    if (exact) return exact
    const found = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase())
    if (found) {
      const value = asString(record[found])
      if (value) return value
    }
  }
  return ''
}

function pickProviderAddressCandidates(json: unknown, address: string, kartverket: ResolvedWasteAddress, municipality: 'Stavanger' | 'Sandnes'): ProviderAddressCandidate[] {
  const query = normalizeAddressText(address)
  const seen = new Set<string>()
  return flattenProviderCandidates(json).map((item): ProviderAddressCandidate | null => {
    const r = asRecord(item)
    const gnr = field(r, 'gnumber', 'gnr', 'gardsnummer', 'gårdsnummer')
    const bnr = field(r, 'bnumber', 'bnr', 'bruksnummer')
    const snr = field(r, 'snumber', 'snr', 'seksjonsnummer') || '0'
    const propertyId = municipality === 'Stavanger'
      ? (field(r, 'ids') || field(r, 'id', 'uuid', 'propertyId', 'property_id', 'guid'))
      : (field(r, 'id') || field(r, 'ids', 'uuid', 'propertyId', 'property_id', 'guid'))
    if (!gnr || !bnr || !propertyId) return null
    const dedupeKey = `${propertyId}:${gnr}:${bnr}:${snr}`
    if (seen.has(dedupeKey)) return null
    seen.add(dedupeKey)
    const label = field(r, 'label', 'text', 'address', 'adresse', 'name', 'adressetekst') || address
    const candidateAddress = normalizeAddressText(label)
    const matrikkelMatch = gnr === kartverket.gnr && bnr === kartverket.bnr && (!kartverket.snr || snr === kartverket.snr)
    const addressMatch = candidateAddress.includes(query) || query.includes(candidateAddress)
    const matchScore = (matrikkelMatch ? 100 : 0) + (addressMatch ? 50 : 0)
    if (!matrikkelMatch && !addressMatch) return null
    return { addressId: propertyId, label, gnr, bnr, snr, propertyId, municipalityName: municipality, matchScore, raw: item }
  }).filter((x): x is ProviderAddressCandidate => Boolean(x)).sort((a, b) => b.matchScore - a.matchScore)
}

function providerCandidateLog(candidate: ProviderAddressCandidate) {
  return { label: candidate.label, id: candidate.propertyId, ids: candidate.propertyId, propertyId: candidate.propertyId, gnumber: candidate.gnr, bnumber: candidate.bnr, snumber: candidate.snr, gnr: candidate.gnr, bnr: candidate.bnr, snr: candidate.snr, matchScore: candidate.matchScore }
}

function providerCandidateDebugLogs(json: unknown): Array<{ label: string | null; id: string | null; ids: string | null; gnumber: string | null; bnumber: string | null; snumber: string }> {
  return flattenProviderCandidates(json).map((item) => {
    const r = asRecord(item)
    const id = field(r, 'id', 'uuid', 'propertyId', 'property_id', 'guid')
    const ids = field(r, 'ids')
    const gnumber = field(r, 'gnumber', 'gnr', 'gardsnummer', 'gårdsnummer')
    const bnumber = field(r, 'bnumber', 'bnr', 'bruksnummer')
    const snumber = field(r, 'snumber', 'snr', 'seksjonsnummer') || '0'
    if (!id && !ids && !gnumber && !bnumber) return null
    return {
      label: field(r, 'label', 'text', 'address', 'adresse', 'name', 'adressetekst') || null,
      id: id || null,
      ids: ids || null,
      gnumber: gnumber || null,
      bnumber: bnumber || null,
      snumber,
    }
  }).filter((candidate): candidate is { label: string | null; id: string | null; ids: string | null; gnumber: string | null; bnumber: string | null; snumber: string } => Boolean(candidate))
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
