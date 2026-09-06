import { wasteCollectionDisplayTitle } from './display.ts'

export type WasteType = 'restavfall' | 'matavfall' | 'papir' | 'plast' | 'glass_metall' | 'hageavfall' | 'christmas_tree' | 'hazardous' | 'textile' | 'other'
export type WasteProviderKey = 'stavanger' | 'hentavfall' | 'sandnes' | 'min_renovasjon'

export type WasteAddress = {
  addressId: string
  label: string
  municipalityNumber: string
  municipalityName: string
  addressCode?: string
  streetName?: string
  houseNumber?: string
  houseLetter?: string
  postalCode?: string
  postalPlace?: string
  lat?: number
  lon?: number
  gnr?: string
  bnr?: string
  fnr?: string
  snr?: string
  propertyId?: string
}

export type WasteCollection = { date: string; normalizedType: WasteType; originalLabel: string; raw?: unknown; sourceUrl?: string }
export type WasteErrorCode = 'unsupported' | 'temporary_failure' | 'invalid_response' | 'configuration'

export class WasteProviderError extends Error {
  code: WasteErrorCode
  retryable: boolean
  constructor(code: WasteErrorCode, message: string, retryable = code !== 'unsupported') { super(message); this.name = 'WasteProviderError'; this.code = code; this.retryable = retryable }
}

export interface WasteProvider {
  key: WasteProviderKey
  canHandle(address: WasteAddress): boolean
  resolveAddress(address: WasteAddress): Promise<WasteAddress>
  fetchCollections(address: WasteAddress): Promise<unknown>
  normalizeCollections(raw: unknown): WasteCollection[]
}

type Fetch = typeof fetch
const ymd = /^\d{4}-\d{2}-\d{2}$/
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {}
const string = (v: unknown) => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''

export function normalizeWasteType(label: unknown): WasteType {
  const value = string(label).toLocaleLowerCase('nb-NO').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/juletre/.test(value)) return 'christmas_tree'
  if (/farlig/.test(value)) return 'hazardous'
  if (/tekstil|kl[æe]r/.test(value)) return 'textile'
  if (/mat|bio/.test(value)) return 'matavfall'
  if (/papir|papp/.test(value)) return 'papir'
  if (/plast/.test(value)) return 'plast'
  if (/glass|metall/.test(value)) return 'glass_metall'
  if (/hage/.test(value)) return 'hageavfall'
  if (/rest/.test(value)) return 'restavfall'
  return 'other'
}

export function wasteCollectionTitle(type: WasteType, original = '') {
  return wasteCollectionDisplayTitle(type, 'no', original)
}

function parseKartverketHit(hit: Record<string, any>): WasteAddress {
  const municipalityNumber = string(hit.kommunenummer)
  const addressCode = string(hit.adressekode)
  const number = string(hit.nummer)
  const houseLetter = string(hit.bokstav)
  const postalCode = string(hit.postnummer)
  const postalPlace = string(hit.poststed)
  const addressText = string(hit.adressetekst) || `${string(hit.adressenavn)} ${number}${houseLetter}`.trim()
  const label = [addressText, [postalCode, postalPlace].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const point = record(hit.representasjonspunkt)
  return {
    addressId: [municipalityNumber, addressCode, number, houseLetter].join('-'), label,
    municipalityNumber, municipalityName: string(hit.kommunenavn), addressCode: addressCode || undefined,
    streetName: string(hit.adressenavn) || undefined, houseNumber: `${number}${houseLetter}` || undefined,
    houseLetter: houseLetter || undefined, postalCode: postalCode || undefined, postalPlace: postalPlace || undefined,
    lat: Number.isFinite(Number(point.lat)) ? Number(point.lat) : undefined, lon: Number.isFinite(Number(point.lon)) ? Number(point.lon) : undefined,
    gnr: string(hit.gardsnummer) || undefined, bnr: string(hit.bruksnummer) || undefined,
    fnr: string(hit.festenummer) || undefined, snr: string(hit.seksjonsnummer) || '0',
  }
}

export async function searchKartverketAddresses(query: string, fetcher: Fetch = fetch): Promise<WasteAddress[]> {
  if (query.trim().length < 3) return []
  const url = new URL('https://ws.geonorge.no/adresser/v1/sok')
  url.searchParams.set('sok', query.trim()); url.searchParams.set('treffPerSide', '10'); url.searchParams.set('asciiKompatibel', 'true')
  let response: Response
  try { response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }) }
  catch { throw new WasteProviderError('temporary_failure', 'Address search is temporarily unavailable.') }
  if (!response.ok) throw new WasteProviderError('temporary_failure', `Address search failed (${response.status}).`)
  let json: any
  try { json = await response.json() } catch { throw new WasteProviderError('invalid_response', 'Address search returned an invalid response.') }
  if (!Array.isArray(json?.adresser)) throw new WasteProviderError('invalid_response', 'Address search returned an invalid response.')
  return json.adresser.map((hit: unknown) => parseKartverketHit(record(hit))).filter((a: WasteAddress) => a.municipalityNumber && a.label)
}

export async function resolveKartverketAddress(query: string, fetcher: Fetch = fetch) {
  const hits = await searchKartverketAddresses(query, fetcher)
  if (!hits.length) throw new WasteProviderError('unsupported', 'Address not found.', false)
  return hits[0]
}

function collection(date: unknown, label: unknown, raw: unknown, sourceUrl?: string): WasteCollection | null {
  const day = string(date).slice(0, 10); const originalLabel = string(label)
  return ymd.test(day) && originalLabel ? { date: day, normalizedType: normalizeWasteType(originalLabel), originalLabel, raw, sourceUrl } : null
}

function dedupe(rows: Array<WasteCollection | null>) {
  const map = new Map<string, WasteCollection>()
  for (const row of rows) if (row) map.set(`${row.date}:${row.normalizedType}:${row.originalLabel.toLowerCase()}`, row)
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.originalLabel.localeCompare(b.originalLabel, 'nb'))
}

function candidates(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value.flatMap(candidates)
  const r = record(value); if (!Object.keys(r).length) return []
  return [r, ...Object.values(r).flatMap(candidates)]
}

function normalizeAddress(value: unknown) {
  return string(value).toLocaleLowerCase('nb-NO').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function propertyIdFromRecord(r: Record<string, any>, stavanger: boolean) {
  const direct = string(stavanger ? (r.ids ?? r.id ?? r.uuid ?? r.propertyId ?? r.property_id) : (r.id ?? r.ids ?? r.uuid ?? r.propertyId ?? r.property_id))
  if (direct) return direct
  const link = string(r.url ?? r.href ?? r.value)
  if (!link) return ''
  try {
    const url = new URL(link, 'https://provider.invalid')
    return string(url.searchParams.get(stavanger ? 'ids' : 'id') ?? url.searchParams.get(stavanger ? 'id' : 'ids'))
  } catch { return '' }
}

function propertyCandidate(value: unknown, address: WasteAddress, stavanger: boolean) {
  const expected = normalizeAddress(address.label.split(',')[0])
  return candidates(value).find(r => {
    const g = string(r.gnumber ?? r.gnr ?? r.gardsnummer), b = string(r.bnumber ?? r.bnr ?? r.bruksnummer), s = string(r.snumber ?? r.snr ?? r.seksjonsnummer) || '0'
    const label = normalizeAddress(r.address ?? r.adresse ?? r.label ?? r.text ?? r.adressetekst)
    const hasId = propertyIdFromRecord(r, stavanger)
    return Boolean(hasId && ((g === address.gnr && b === address.bnr && s === (address.snr || '0')) || (label && (label.includes(expected) || expected.includes(label)))))
  })
}

type AddressSearchContract = { endpoint: string; method: 'GET' | 'POST'; parameter: string }
const searchParameter = /^(?:search|searchtext|query|q|term)$/i
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(x => [x[1].toLowerCase(), x[2]]))
const textInput = (tag: string) => {
  const values = attrs(tag)
  const type = (values.type || 'text').toLowerCase()
  return type === 'text' || type === 'search' ? values : null
}

function addressSearchContracts(html: string, base: string): AddressSearchContract[] {
  const contracts: AddressSearchContract[] = []
  const add = (endpoint: string, method: string, parameter: string) => {
    try {
      const contract = { endpoint: new URL(endpoint, base).toString(), method: method.toUpperCase() === 'POST' ? 'POST' as const : 'GET' as const, parameter }
      if (parameter && !contracts.some(x => x.endpoint === contract.endpoint && x.method === contract.method && x.parameter === parameter)) contracts.push(contract)
    } catch { /* Ignore invalid page metadata. */ }
  }
  // The official pages publish the request contract on otherwise generic text inputs.
  for (const tag of html.matchAll(/<input\b[^>]*>/gi)) {
    const values = textInput(tag[0])
    if (!values) continue
    const endpoint = values['data-url'] || values['data-search-url'] || values['data-autocomplete-url'] || values['data-endpoint']
    const parameter = values['data-parameter'] || values.name || ''
    if (endpoint && searchParameter.test(parameter)) add(endpoint, values['data-method'] || 'GET', parameter)
  }
  // Other versions use an ordinary form with a text/search input.
  for (const form of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)) {
    const open = form[0].match(/^<form\b[^>]*>/i)?.[0] || ''
    const formAttrs = attrs(open)
    const input = [...form[0].matchAll(/<input\b[^>]*>/gi)].map(x => textInput(x[0])).find(x => x?.name && searchParameter.test(x.name))
    const endpoint = formAttrs['data-search-url'] || formAttrs['data-autocomplete-url'] || formAttrs.action
    if (endpoint && input?.name) add(endpoint, formAttrs['data-method'] || formAttrs.method || 'GET', input.name)
  }
  // Inline configuration occasionally carries the same three contract fields.
  for (const script of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const endpointMatch of script[1].matchAll(/(?:url|searchUrl|autocompleteUrl|endpoint)\s*[:=]\s*["']([^"']+)["']/gi)) {
      const context = script[1].slice(Math.max(0, (endpointMatch.index || 0) - 300), (endpointMatch.index || 0) + endpointMatch[0].length + 300)
      const method = context.match(/method\s*[:=]\s*["'](GET|POST)["']/i)?.[1] || 'GET'
      const parameter = context.match(/(?:parameter|param|queryParameter)\s*[:=]\s*["'](search|searchText|query|q|term)["']/i)?.[1]
      if (parameter) add(endpointMatch[1], method, parameter)
    }
  }
  return contracts
}

function discoveryStructure(html: string, base: string) {
  const safePath = (value: string) => {
    if (!/^(?:https?:\/\/|\/)/i.test(value)) return ''
    try { const url = new URL(value, base); return `${url.origin === new URL(base).origin ? '' : url.origin}${url.pathname}` } catch { return '' }
  }
  const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map(match => textInput(match[0])).filter(Boolean).map(values => ({
    type: values!.type || 'text', name: values!.name || '', id: values!.id || '', classes: (values!.class || '').split(/\s+/).filter(Boolean).slice(0, 8),
    dataAttributes: Object.keys(values!).filter(name => name.startsWith('data-')),
    urlValues: Object.entries(values!).filter(([name, value]) => name.startsWith('data-') && /^(?:https?:\/\/|\/)/.test(value)).map(([name, value]) => ({ name, path: safePath(value) })).filter(x => x.path),
  })).slice(0, 20)
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map(match => {
    const formAttrs = attrs(match[0].match(/^<form\b[^>]*>/i)?.[0] || '')
    const containedInputs = [...match[0].matchAll(/<input\b[^>]*>/gi)].map(x => attrs(x[0])).map(x => ({ name: x.name || '', type: x.type || 'text' })).slice(0, 20)
    return { actionPath: safePath(formAttrs.action || ''), method: (formAttrs.method || 'GET').toUpperCase(), inputs: containedInputs }
  }).slice(0, 20)
  const scriptSrcPaths = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(x => safePath(x[1])).filter(Boolean))].slice(0, 20)
  const inlineSearchPaths = [...html.matchAll(/["']([^"']*(?:search|sok|søk|address|adresse|autocomplete)[^"']*)["']/gi)].map(x => safePath(x[1])).filter(Boolean).slice(0, 20)
  const showQueryNames = [...html.matchAll(/(?:href|value)=["']([^"']*\/show\?[^"']*)["']/gi)].map(x => { try { return [...new URL(x[1], base).searchParams.keys()] } catch { return [] } }).slice(0, 20)
  return { inputs, forms, scriptSrcPaths, inlineSearchPaths, showQueryNames }
}

function propertyCandidateFromHtml(html: string, address: WasteAddress, stavanger: boolean) {
  const expected = normalizeAddress(address.label.split(',')[0])
  for (const tag of html.matchAll(/<(?:option|li|button|a)\b[^>]*(?:data-(?:ids?|uuid|property-id)|value)=["']([^"']+)["'][^>]*>[\s\S]*?<\/(?:option|li|button|a)>/gi)) {
    const text = normalizeAddress(tag[0].replace(/<[^>]+>/g, ' '))
    if (text.includes(expected) || expected.includes(text)) return propertyIdFromRecord({ value: tag[1] }, stavanger) || tag[1]
  }
  for (const href of html.matchAll(/(?:href|value)=["']([^"']+)["']/gi)) {
    const id = propertyIdFromRecord({ value: href[1] }, stavanger)
    const surrounding = normalizeAddress(html.slice(Math.max(0, (href.index || 0) - 300), (href.index || 0) + 500).replace(/<[^>]+>/g, ' '))
    if (id && (surrounding.includes(expected) || expected.includes(surrounding))) return id
  }
  return ''
}

function responseShape(body: string, contentType: string) {
  if (!contentType.includes('json')) return { kind: 'html', bytes: body.length, hasShowLink: /[?&](?:ids?|id)=/i.test(body) }
  try {
    const parsed = JSON.parse(body)
    if (Array.isArray(parsed)) return { kind: 'json-array', count: parsed.length }
    const keys = Object.keys(record(parsed)).slice(0, 8)
    return { kind: 'json-object', keys }
  } catch { return { kind: 'invalid-json', bytes: body.length } }
}

function calendarYear(dataMonth: string) {
  const match = dataMonth.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/)
  return match?.[1] || ''
}

export function parseNorconsultCalendarHtml(html: string, sourceUrl = '') {
  const rows: Array<WasteCollection | null> = []
  const monthMarkers = [...html.matchAll(/data-month=["']([^"']+)["']/gi)]
  const sections = monthMarkers.map((marker, index) => ({
    year: calendarYear(marker[1]),
    html: html.slice(marker.index || 0, monthMarkers[index + 1]?.index ?? html.length),
  }))
  if (!sections.length) sections.push({ year: '', html })
  for (const section of sections) {
    for (const match of section.html.matchAll(/<tr\b[^>]*class=["'][^"']*waste-calendar__item[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi)) {
      const dateMatch = match[0].match(/(\d{2})\.(\d{2})(?:\.(\d{4}))?/)
      if (!dateMatch) continue
      const year = dateMatch[3] || section.year
      if (!year) throw new WasteProviderError('invalid_response', 'Waste calendar row has no year context.')
      const day = `${year}-${dateMatch[2]}-${dateMatch[1]}`
      const labels = [...match[0].matchAll(/(?:alt|title|aria-label)=["']([^"']+)["']|Image:\s*([^<\n]+)/gi)].map(m => m[1] || m[2]).filter(x => normalizeWasteType(x) !== 'other')
      for (const label of new Set(labels)) rows.push(collection(day, label, match[0], sourceUrl))
    }
  }
  return dedupe(rows)
}

function createNorconsultProvider(fetcher: Fetch, municipalityNumber: '1103' | '1108'): WasteProvider {
  const stavanger = municipalityNumber === '1103'
  const base = stavanger ? 'https://www.stavanger.kommune.no/renovasjon-og-miljo/tommekalender/finn-kalender' : 'https://www.hentavfall.no/rogaland/sandnes/tommekalender'
  const municipality = stavanger ? 'Stavanger' : 'Sandnes'
  return {
    key: stavanger ? 'stavanger' : 'hentavfall', canHandle: a => a.municipalityNumber === municipalityNumber,
    async resolveAddress(address) {
      if (address.propertyId) return address
      let landing: Response
      try { landing = await fetcher(`${base}/`, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(10000) }) } catch { throw new WasteProviderError('temporary_failure', `${municipality} address lookup is temporarily unavailable.`) }
      if (!landing.ok) throw new WasteProviderError(landing.status >= 500 ? 'temporary_failure' : 'unsupported', 'Waste collection isn’t available for this address yet.', landing.status >= 500)
      const html = await landing.text()
      const contracts = addressSearchContracts(html, `${base}/`)
      let propertyId = propertyCandidateFromHtml(html, address, stavanger)
      console.info('[waste] property resolution discovered', {
        municipality, provider: stavanger ? 'stavanger' : 'hentavfall', landingEndpoint: base,
        status: landing.status, contentType: (landing.headers.get('content-type') || '').split(';')[0],
        shape: responseShape(html, landing.headers.get('content-type') || 'text/html'),
        contracts: contracts.map(x => ({ endpoint: x.endpoint, method: x.method, parameter: x.parameter })),
        ...(contracts.length ? {} : { discoveryStructure: discoveryStructure(html, `${base}/`) }),
      })
      for (const contract of contracts) {
        if (propertyId) break
        const url = new URL(contract.endpoint)
        const request: RequestInit = { method: contract.method, headers: { Accept: 'application/json, text/html' }, signal: AbortSignal.timeout(10000) }
        if (contract.method === 'POST') {
          request.headers = { ...request.headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
          request.body = new URLSearchParams({ [contract.parameter]: address.label })
        } else url.searchParams.set(contract.parameter, address.label)
        let response: Response
        try { response = await fetcher(url, request) } catch {
          console.info('[waste] property resolution attempt', { municipality, provider: stavanger ? 'stavanger' : 'hentavfall', endpoint: url.origin + url.pathname, method: contract.method, status: 'network-error' })
          continue
        }
        const body = await response.text()
        const contentType = response.headers.get('content-type') || ''
        console.info('[waste] property resolution attempt', { municipality, provider: stavanger ? 'stavanger' : 'hentavfall', endpoint: url.origin + url.pathname, method: contract.method, status: response.status, contentType: contentType.split(';')[0], shape: responseShape(body, contentType) })
        if (!response.ok) continue
        let parsed: unknown = null; try { parsed = JSON.parse(body) } catch { /* Some official selectors return option HTML. */ }
        const match = propertyCandidate(parsed, address, stavanger)
        propertyId = match ? propertyIdFromRecord(match, stavanger) : propertyCandidateFromHtml(body, address, stavanger)
      }
      if (!propertyId) throw new WasteProviderError('unsupported', 'Waste collection isn’t available for this address yet.', false)
      return { ...address, propertyId }
    },
    async fetchCollections(address) {
      if (!address.propertyId || !address.gnr || !address.bnr) throw new WasteProviderError('invalid_response', `${municipality} property identifier is missing.`)
      const url = new URL(`${base}/show`); url.searchParams.set(stavanger ? 'ids' : 'id', address.propertyId); url.searchParams.set('gnumber', address.gnr); url.searchParams.set('bnumber', address.bnr); url.searchParams.set('snumber', address.snr || '0'); url.searchParams.set('municipality', stavanger ? 'Stavanger' : 'Sandnes kommune')
      let response: Response; try { response = await fetcher(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(12000) }) } catch { throw new WasteProviderError('temporary_failure', 'Stavanger calendar is temporarily unavailable.') }
      if (!response.ok) throw new WasteProviderError('temporary_failure', `Stavanger calendar failed (${response.status}).`)
      return { html: await response.text(), sourceUrl: url.toString() }
    },
    normalizeCollections(raw) {
      const { html, sourceUrl } = record(raw); if (typeof html !== 'string') throw new WasteProviderError('invalid_response', 'Stavanger returned an invalid calendar.')
      const result = parseNorconsultCalendarHtml(html, string(sourceUrl)); if (!result.length) throw new WasteProviderError('invalid_response', 'Stavanger returned no parseable collection dates.')
      return result
    },
  }
}

export function createStavangerProvider(fetcher: Fetch = fetch): WasteProvider { return createNorconsultProvider(fetcher, '1103') }
export function createHentavfallProvider(fetcher: Fetch = fetch): WasteProvider { return createNorconsultProvider(fetcher, '1108') }

export function createMinRenovasjonProvider(appKey = process.env.MINRENOVASJON_APP_KEY || '', fetcher: Fetch = fetch): WasteProvider {
  const base = 'https://komteksky.norkart.no/MinRenovasjon.Api/api'
  const proxy = 'https://norkartrenovasjon.azurewebsites.net/proxyserver.ashx'
  const request = async (path: string, address: WasteAddress) => {
    if (!appKey) throw new WasteProviderError('configuration', 'MinRenovasjon is temporarily unavailable because the service key is not configured.')
    const upstream = new URL(`${base}/${path}`); upstream.searchParams.set('kommunenr', address.municipalityNumber); upstream.searchParams.set('gatekode', address.addressCode || ''); upstream.searchParams.set('gatenavn', address.streetName || ''); upstream.searchParams.set('husnr', address.houseNumber || '')
    const url = new URL(proxy); url.searchParams.set('server', upstream.toString())
    let response: Response; try { response = await fetcher(url, { headers: { Accept: 'application/json', RenovasjonAppKey: appKey, Kommunenr: address.municipalityNumber }, signal: AbortSignal.timeout(12000) }) } catch { throw new WasteProviderError('temporary_failure', 'MinRenovasjon is temporarily unavailable.') }
    if (!response.ok) {
      const code: WasteErrorCode = response.status === 401 || response.status === 403 ? 'configuration' : response.status === 429 || response.status >= 500 ? 'temporary_failure' : response.status === 404 ? 'unsupported' : 'invalid_response'
      throw new WasteProviderError(code, `MinRenovasjon failed (${response.status}).`, code !== 'unsupported')
    }
    try { return await response.json() } catch { throw new WasteProviderError('invalid_response', 'MinRenovasjon returned invalid JSON.') }
  }
  return {
    key: 'min_renovasjon', canHandle: () => true, resolveAddress: async a => a,
    async fetchCollections(address) { return { fractions: await request('fraksjoner', address), calendar: await request('tommekalender', address) } },
    normalizeCollections(raw) {
      const r = record(raw); if (!Array.isArray(r.fractions) || !Array.isArray(r.calendar)) throw new WasteProviderError('invalid_response', 'MinRenovasjon returned an invalid response.')
      const names = new Map(r.fractions.map((f: unknown) => { const x = record(f); return [string(x.Id ?? x.id ?? x.FraksjonId), string(x.Navn ?? x.navn ?? x.Name)] }))
      const rows = r.calendar.flatMap((entry: unknown) => { const x = record(entry); const id = string(x.FraksjonId ?? x.fraksjonId ?? x.Id); const label = names.get(id) || string(x.Fraksjon ?? x.fraksjon); const dates = Array.isArray(x.Tommedatoer ?? x.tommedatoer) ? x.Tommedatoer ?? x.tommedatoer : [x.Tommedato ?? x.tommedato ?? x.Dato ?? x.dato]; return dates.map((date: unknown) => collection(date, label, entry)) })
      const result = dedupe(rows); if (!result.length) throw new WasteProviderError('invalid_response', 'MinRenovasjon returned no valid collection dates.')
      return result
    },
  }
}

export function providerForAddress(address: WasteAddress, fetcher: Fetch = fetch) {
  if (address.municipalityNumber === '1103') return createStavangerProvider(fetcher)
  // Sandnes stays an explicit adapter and can be expanded independently; current public flow is compatible with Stavanger's Norconsult contract.
  if (address.municipalityNumber === '1108') return createHentavfallProvider(fetcher)
  return createMinRenovasjonProvider(process.env.MINRENOVASJON_APP_KEY || '', fetcher)
}
