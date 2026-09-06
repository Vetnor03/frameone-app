import { wasteCollectionDisplayTitle } from './display.ts'
import { norwayLocalYmd } from './date.ts'

export type WasteType = 'restavfall' | 'matavfall' | 'papir' | 'plast' | 'glass_metall' | 'hageavfall' | 'christmas_tree' | 'hazardous' | 'textile' | 'other'
export type SemanticSource = 'json_field' | 'fraction_id' | 'visible_text' | 'img_title' | 'img_alt' | 'aria_label' | 'css_identifier' | 'ics_title' | 'other'
export type ProviderFamily = 'him' | 'oslo' | 'minrenovasjon' | 'renovasjonsportal' | 'norconsult_unresolved'

export type RawCollection = {
  date: string
  rawType: string
  providerTypeId?: string
  providerEventId?: string
  semanticSource: SemanticSource
  raw?: unknown
}

export type WasteAddress = {
  addressId: string; label: string; municipalityNumber: string; municipalityName: string
  addressCode?: string; streetName?: string; houseNumber?: string; houseLetter?: string
  postalCode?: string; postalPlace?: string; lat?: number; lon?: number
  gnr?: string; bnr?: string; fnr?: string; snr?: string; propertyId?: string
}

export type WasteCollection = RawCollection & { normalizedType: WasteType; originalLabel: string; sourceUrl?: string }
export type WasteErrorCode = 'unsupported' | 'temporary_failure' | 'invalid_response' | 'configuration'

export class WasteProviderError extends Error {
  code: WasteErrorCode; retryable: boolean
  constructor(code: WasteErrorCode, message: string, retryable = code !== 'unsupported') { super(message); this.name = 'WasteProviderError'; this.code = code; this.retryable = retryable }
}

export interface WasteProvider {
  family: ProviderFamily
  resolveAddress(address: WasteAddress): Promise<WasteAddress>
  fetchCollections(address: WasteAddress): Promise<unknown>
  normalizeCollections(raw: unknown): WasteCollection[]
}

export type ProviderRegistration = {
  municipalityNumber: string
  municipalityName: string
  family: ProviderFamily
  brand: string
  status: 'supported' | 'preview'
  baseUrl?: string
}

// This is deliberately an allow-list. Kartverket municipality numbers not present here
// are unsupported; they must never be used to probe MinRenovasjon or another provider.
export const WASTE_PROVIDER_REGISTRY: readonly ProviderRegistration[] = [
  { municipalityNumber: '0301', municipalityName: 'Oslo', family: 'oslo', brand: 'Oslo kommune', status: 'supported' },
  { municipalityNumber: '1103', municipalityName: 'Stavanger', family: 'norconsult_unresolved', brand: 'Stavanger kommune', status: 'preview' },
  { municipalityNumber: '1106', municipalityName: 'Haugesund', family: 'him', brand: 'Haugaland Interkommunale Miljøverk', status: 'supported' },
  { municipalityNumber: '1108', municipalityName: 'Sandnes', family: 'norconsult_unresolved', brand: 'Sandnes kommune', status: 'preview' },
  { municipalityNumber: '3205', municipalityName: 'Lillestrøm', family: 'minrenovasjon', brand: 'ROAF', status: 'supported' },
  { municipalityNumber: '3220', municipalityName: 'Enebakk', family: 'minrenovasjon', brand: 'ROAF', status: 'supported' },
  { municipalityNumber: '3222', municipalityName: 'Lørenskog', family: 'minrenovasjon', brand: 'ROAF', status: 'supported' },
  { municipalityNumber: '3224', municipalityName: 'Rælingen', family: 'minrenovasjon', brand: 'ROAF', status: 'supported' },
  { municipalityNumber: '3226', municipalityName: 'Aurskog-Høland', family: 'minrenovasjon', brand: 'ROAF', status: 'supported' },
  { municipalityNumber: '3230', municipalityName: 'Gjerdrum', family: 'minrenovasjon', brand: 'ROAF', status: 'supported' },
  { municipalityNumber: '3232', municipalityName: 'Nittedal', family: 'minrenovasjon', brand: 'ROAF', status: 'supported' },
  { municipalityNumber: '5006', municipalityName: 'Steinkjer', family: 'renovasjonsportal', brand: 'ReMidt', status: 'supported', baseUrl: 'https://kalender.renovasjonsportal.no/api' },
  { municipalityNumber: '5055', municipalityName: 'Heim', family: 'renovasjonsportal', brand: 'ReMidt', status: 'supported', baseUrl: 'https://kalender.renovasjonsportal.no/api' },
  { municipalityNumber: '5059', municipalityName: 'Orkland', family: 'renovasjonsportal', brand: 'ReMidt', status: 'supported', baseUrl: 'https://kalender.renovasjonsportal.no/api' },
  { municipalityNumber: '5020', municipalityName: 'Osen', family: 'renovasjonsportal', brand: 'Fosen Renovasjon', status: 'supported', baseUrl: 'https://fosen.renovasjonsportal.no/api' },
  { municipalityNumber: '5054', municipalityName: 'Indre Fosen', family: 'renovasjonsportal', brand: 'Fosen Renovasjon', status: 'supported', baseUrl: 'https://fosen.renovasjonsportal.no/api' },
] as const

type Fetch = typeof fetch
const ymd = /^\d{4}-\d{2}-\d{2}$/
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {}
const string = (v: unknown) => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''

export function providerRegistrationFor(municipalityNumber: string) { return WASTE_PROVIDER_REGISTRY.find(row => row.municipalityNumber === municipalityNumber) }

export function normalizeWasteType(label: unknown): WasteType {
  const value = string(label).toLocaleLowerCase('nb-NO').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/juletre/.test(value)) return 'christmas_tree'; if (/farlig/.test(value)) return 'hazardous'; if (/tekstil|kl[æe]r/.test(value)) return 'textile'
  if (/mat|bio/.test(value)) return 'matavfall'; if (/papir|papp/.test(value)) return 'papir'; if (/plast/.test(value)) return 'plast'
  if (/glass|metall/.test(value)) return 'glass_metall'; if (/hage/.test(value)) return 'hageavfall'; if (/rest/.test(value)) return 'restavfall'
  return 'other'
}

export function wasteCollectionTitle(type: WasteType, original = '') { return wasteCollectionDisplayTitle(type, 'no', original) }

function parseKartverketHit(hit: Record<string, any>): WasteAddress {
  const municipalityNumber = string(hit.kommunenummer), addressCode = string(hit.adressekode), number = string(hit.nummer), houseLetter = string(hit.bokstav)
  const postalCode = string(hit.postnummer), postalPlace = string(hit.poststed), addressText = string(hit.adressetekst) || `${string(hit.adressenavn)} ${number}${houseLetter}`.trim()
  const point = record(hit.representasjonspunkt)
  return { addressId: [municipalityNumber, addressCode, number, houseLetter].join('-'), label: [addressText, [postalCode, postalPlace].filter(Boolean).join(' ')].filter(Boolean).join(', '), municipalityNumber, municipalityName: string(hit.kommunenavn), addressCode: addressCode || undefined, streetName: string(hit.adressenavn) || undefined, houseNumber: number || undefined, houseLetter: houseLetter || undefined, postalCode: postalCode || undefined, postalPlace: postalPlace || undefined, lat: Number.isFinite(Number(point.lat)) ? Number(point.lat) : undefined, lon: Number.isFinite(Number(point.lon)) ? Number(point.lon) : undefined, gnr: string(hit.gardsnummer) || undefined, bnr: string(hit.bruksnummer) || undefined, fnr: string(hit.festenummer) || undefined, snr: string(hit.seksjonsnummer) || '0' }
}

export async function searchKartverketAddresses(query: string, fetcher: Fetch = fetch): Promise<WasteAddress[]> {
  if (query.trim().length < 3) return []
  const url = new URL('https://ws.geonorge.no/adresser/v1/sok'); url.searchParams.set('sok', query.trim()); url.searchParams.set('treffPerSide', '10'); url.searchParams.set('asciiKompatibel', 'true')
  let response: Response; try { response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }) } catch { throw new WasteProviderError('temporary_failure', 'Address search is temporarily unavailable.') }
  if (!response.ok) throw new WasteProviderError('temporary_failure', `Address search failed (${response.status}).`)
  let json: any; try { json = await response.json() } catch { throw new WasteProviderError('invalid_response', 'Address search returned an invalid response.') }
  if (!Array.isArray(json?.adresser)) throw new WasteProviderError('invalid_response', 'Address search returned an invalid response.')
  return json.adresser.map((hit: unknown) => parseKartverketHit(record(hit))).filter((a: WasteAddress) => a.municipalityNumber && a.label)
}

function makeCollection(value: RawCollection, sourceUrl?: string): WasteCollection | null {
  const date = string(value.date).slice(0, 10), rawType = string(value.rawType)
  if (!ymd.test(date) || !rawType) return null
  return { ...value, date, rawType, originalLabel: rawType, normalizedType: normalizeWasteType(rawType), sourceUrl }
}

function finish(rows: Array<WasteCollection | null>, provider: string) {
  const unique = new Map<string, WasteCollection>()
  for (const row of rows) if (row) unique.set(`${row.date}:${row.providerEventId || ''}:${row.providerTypeId || ''}:${row.rawType.toLocaleLowerCase('nb-NO')}`, row)
  const result = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.rawType.localeCompare(b.rawType, 'nb'))
  if (!result.length) throw new WasteProviderError('invalid_response', `${provider} returned no valid collection dates.`)
  return result
}

async function responseBody(response: Response, provider: string, json = true) {
  if (!response.ok) {
    const code: WasteErrorCode = response.status === 401 || response.status === 403 ? 'configuration' : response.status === 404 ? 'unsupported' : response.status === 429 || response.status >= 500 ? 'temporary_failure' : 'invalid_response'
    throw new WasteProviderError(code, `${provider} failed (${response.status}).`, code !== 'unsupported')
  }
  try { return json ? await response.json() : await response.text() } catch { throw new WasteProviderError('invalid_response', `${provider} returned an invalid response.`) }
}

export function createHimProvider(fetcher: Fetch = fetch): WasteProvider {
  const endpoint = 'https://him.as/tommekalender/'
  return { family: 'him', resolveAddress: async address => address,
    async fetchCollections(address) { const url = new URL(endpoint); url.searchParams.set('adressesok', address.label.split(',')[0]); let response: Response; try { response = await fetcher(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(12000) }) } catch { throw new WasteProviderError('temporary_failure', 'HIM is temporarily unavailable.') }; return { html: await responseBody(response, 'HIM', false), sourceUrl: url.toString() } },
    normalizeCollections(raw) {
      const r = record(raw); if (typeof r.html !== 'string') throw new WasteProviderError('invalid_response', 'HIM returned an invalid response.')
      const months: Record<string, string> = { januar: '01', februar: '02', mars: '03', april: '04', mai: '05', juni: '06', juli: '07', august: '08', september: '09', oktober: '10', november: '11', desember: '12' }
      const rows: Array<WasteCollection | null> = []
      const markers = [...r.html.matchAll(/<div\b[^>]*class=["'][^"']*tommekalender__section[^"']*tommekalender__month[^"']*["'][^>]*>/gi)]
      for (const [index, marker] of markers.entries()) {
        const section = r.html.slice(marker.index, markers[index + 1]?.index ?? r.html.length)
        const heading = section.match(/<h2\b[^>]*>\s*([^<]+)\s*<\/h2>/i)?.[1].toLocaleLowerCase('nb-NO') || ''
        const context = heading.match(/([a-zæøå]+)\s+((?:19|20)\d{2})/i), month = context && months[context[1]], year = context?.[2]
        if (!month || !year) continue
        for (const cell of section.matchAll(/<td\b[^>]*class=["'][^"']*tommekalender__calendartable__day--has-activities[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)) {
          const dateElement = cell[1].match(/<[^>]+class=["'][^"']*tommekalender__calendartable__date[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
          const day = dateElement?.[1].replace(/<[^>]+>/g, ' ').match(/\b([0-3]?\d)\b/)?.[1]; if (!day) continue
          for (const item of cell[1].matchAll(/<li\b[^>]*class=["'][^"']*tommekalender__calendartable__listitem[^"']*["'][^>]*data-type=["']([^"']+)["'][^>]*>[\s\S]*?<\/li>/gi)) rows.push(makeCollection({ date: `${year}-${month}-${day.padStart(2, '0')}`, rawType: item[1], providerTypeId: item[1], semanticSource: 'css_identifier', raw: item[0] }, string(r.sourceUrl)))
        }
      }
      return finish(rows, 'HIM')
    }
  }
}

export function createOsloProvider(fetcher: Fetch = fetch): WasteProvider {
  const endpoint = 'https://www.oslo.kommune.no/actions/snap-lib-waste-complaint/search-by-address'
  return { family: 'oslo', resolveAddress: async address => address,
    async fetchCollections(address) { if (!address.addressCode || !address.streetName || !address.houseNumber) throw new WasteProviderError('invalid_response', 'Oslo address fields are missing.'); const url = new URL(endpoint); url.searchParams.set('street', address.streetName); url.searchParams.set('number', address.houseNumber); if (address.houseLetter) url.searchParams.set('letter', address.houseLetter); url.searchParams.set('street_id', address.addressCode); let response: Response; try { response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }) } catch { throw new WasteProviderError('temporary_failure', 'Oslo is temporarily unavailable.') }; return responseBody(response, 'Oslo') },
    normalizeCollections(raw) { const root = record(raw), results = root.result; if (!Array.isArray(results)) throw new WasteProviderError('invalid_response', 'Oslo returned an invalid response.'); const services = results.flatMap((result: unknown) => { const points = record(result).HentePunkts; return Array.isArray(points) ? points.flatMap((point: unknown) => Array.isArray(record(point).Tjenester) ? record(point).Tjenester : []) : [] }); const intervals: Record<string, number> = { '10000': 7, '20000': 4, '30000': 3, '40000': 14, '50000': 28 }, today = norwayLocalYmd(); const rows = services.flatMap((entry: unknown) => { const e = record(entry), fraction = record(e.Fraksjon), rawType = string(fraction.Tekst), typeId = string(fraction.Id), eventId = string(e.Id), match = string(e.TommeDato).match(/^(\d{2})\.(\d{2})\.(\d{4})$/); if (!match) return [makeCollection({ date: '', rawType, providerTypeId: typeId || undefined, providerEventId: eventId || undefined, semanticSource: 'json_field', raw: entry })]; const start = `${match[3]}-${match[2]}-${match[1]}`, intervalDays = intervals[string(record(e.Hyppighet).Faktor)] ?? 7, date = new Date(`${start}T12:00:00Z`); while (date.toISOString().slice(0, 10) < today) date.setUTCDate(date.getUTCDate() + intervalDays); return Array.from({ length: 10 }, (_, index) => { const occurrence = new Date(date); occurrence.setUTCDate(date.getUTCDate() + index * intervalDays); const value = occurrence.toISOString().slice(0, 10); return makeCollection({ date: value, rawType, providerTypeId: typeId || undefined, providerEventId: eventId ? `${eventId}:${value}` : undefined, semanticSource: 'json_field', raw: entry }) }) }); return finish(rows, 'Oslo') }
  }
}

export function createMinRenovasjonProvider(appKey = process.env.MINRENOVASJON_APP_KEY || '', fetcher: Fetch = fetch): WasteProvider {
  const base = 'https://komteksky.norkart.no/MinRenovasjon.Api/api', proxy = 'https://norkartrenovasjon.azurewebsites.net/proxyserver.ashx'
  const request = async (path: string, address: WasteAddress) => { if (!appKey) throw new WasteProviderError('configuration', 'MinRenovasjon requires a valid server-only RE:MIND credential.'); const upstream = new URL(`${base}/${path}`); upstream.searchParams.set('kommunenr', address.municipalityNumber); if (path === 'tommekalender') { upstream.searchParams.set('gatekode', address.addressCode || ''); upstream.searchParams.set('gatenavn', address.streetName || ''); upstream.searchParams.set('husnr', `${address.houseNumber || ''}${address.houseLetter || ''}`) } const url = new URL(proxy); url.searchParams.set('server', upstream.toString()); let response: Response; try { response = await fetcher(url, { headers: { Accept: 'application/json', RenovasjonAppKey: appKey, Kommunenr: address.municipalityNumber }, signal: AbortSignal.timeout(12000) }) } catch { throw new WasteProviderError('temporary_failure', 'MinRenovasjon is temporarily unavailable.') }; return responseBody(response, 'MinRenovasjon') }
  return { family: 'minrenovasjon', resolveAddress: async address => address, async fetchCollections(address) { return { fractions: await request('fraksjoner', address), calendar: await request('tommekalender', address) } }, normalizeCollections(raw) { const r = record(raw); if (!Array.isArray(r.fractions) || !Array.isArray(r.calendar)) throw new WasteProviderError('invalid_response', 'MinRenovasjon returned an invalid response.'); const names = new Map(r.fractions.map((v: unknown) => { const x = record(v); return [string(x.FraksjonId ?? x.Id ?? x.id), string(x.Navn ?? x.navn)] })); const rows = r.calendar.flatMap((v: unknown) => { const x = record(v), id = string(x.FraksjonId ?? x.fraksjonId ?? x.Id), rawType = names.get(id) || string(x.Fraksjon ?? x.fraksjon) || `Unknown fraction ${id}`, dates = Array.isArray(x.Tommedatoer ?? x.tommedatoer) ? x.Tommedatoer ?? x.tommedatoer : [x.Tommedato ?? x.tommedato ?? x.Dato ?? x.dato]; return dates.map((date: unknown) => makeCollection({ date: string(date), rawType, providerTypeId: id || undefined, providerEventId: string(x.Id ?? x.id) || undefined, semanticSource: 'fraction_id', raw: v })) }); return finish(rows, 'MinRenovasjon') } }
}

export function createRenovasjonsportalProvider(baseUrl: string, fetcher: Fetch = fetch): WasteProvider {
  const base = baseUrl.replace(/\/$/, '')
  return { family: 'renovasjonsportal', async resolveAddress(address) { const selected = address.label.split(',')[0], url = `${base}/address/${encodeURIComponent(selected)}`; let response: Response; try { response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }) } catch { throw new WasteProviderError('temporary_failure', 'Renovasjonsportal is temporarily unavailable.') }; const body = record(await responseBody(response, 'Renovasjonsportal')), results = body.searchResults; if (!Array.isArray(results)) throw new WasteProviderError('invalid_response', 'Renovasjonsportal returned invalid search results.'); const normalized = (value: unknown) => string(value).toLocaleLowerCase('nb-NO').replace(/[^a-zæøå0-9]/g, ''), expected = normalized(selected); const matches = results.map(record).filter(result => [result.title, result.address, result.label, result.text, result.name].some(label => normalized(label) === expected)); const result = matches.length === 1 ? matches[0] : results.length === 1 ? record(results[0]) : {}, propertyId = string(result.id); if (!propertyId) throw new WasteProviderError('unsupported', 'Waste collection isn’t available for this address yet.', false); return { ...address, propertyId } }, async fetchCollections(address) { if (!address.propertyId) throw new WasteProviderError('invalid_response', 'Renovasjonsportal address id is missing.'); let response: Response; try { response = await fetcher(`${base}/address/${encodeURIComponent(address.propertyId)}/details`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }) } catch { throw new WasteProviderError('temporary_failure', 'Renovasjonsportal is temporarily unavailable.') }; return responseBody(response, 'Renovasjonsportal') }, normalizeCollections(raw) { const r = record(raw); if (!Array.isArray(r.disposals)) throw new WasteProviderError('invalid_response', 'Renovasjonsportal returned an invalid response.'); return finish(r.disposals.map((v: unknown) => { const x = record(v); return makeCollection({ date: string(x.date), rawType: string(x.fraction), providerTypeId: string(x.fractionId) || undefined, providerEventId: string(x.id) || undefined, semanticSource: 'json_field', raw: v }) }), 'Renovasjonsportal') } }
}

function unresolvedProvider(): WasteProvider { const unsupported = async () => { throw new WasteProviderError('unsupported', 'Automatic address resolution for this municipality is still in preview.', false) }; return { family: 'norconsult_unresolved', resolveAddress: unsupported, fetchCollections: unsupported, normalizeCollections() { throw new WasteProviderError('unsupported', 'Automatic address resolution for this municipality is still in preview.', false) } } }

export function providerForAddress(address: WasteAddress, fetcher: Fetch = fetch) {
  const registration = providerRegistrationFor(address.municipalityNumber)
  if (!registration) throw new WasteProviderError('unsupported', 'Waste collection isn’t available for this municipality yet.', false)
  if (registration.family === 'him') return createHimProvider(fetcher)
  if (registration.family === 'oslo') return createOsloProvider(fetcher)
  if (registration.family === 'minrenovasjon') return createMinRenovasjonProvider(process.env.MINRENOVASJON_APP_KEY || '', fetcher)
  if (registration.family === 'renovasjonsportal' && registration.baseUrl) return createRenovasjonsportalProvider(registration.baseUrl, fetcher)
  return unresolvedProvider()
}
