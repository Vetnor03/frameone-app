import crypto from 'node:crypto'

export type LocalEventFilter = 'all'
export type NormalizedLocalEvent = {
  external_id: string; title: string; starts_at: string; ends_at: string | null; location: string | null; short_description: string | null; organizer: string | null; category: null; source_url: string; municipality_number: string; source: 'friskus-rss'; provider: 'friskus-rss'; last_fetched_at: string; raw?: Record<string, unknown>
}
export type FriskusMunicipalityConfig = { municipalityNumber: string; municipalityName: string; name: string; provider: 'friskus-rss'; municipalityUuid: string; publicBaseUrl: string }
export type GetLocalEventsOptions = { municipalityNumber: string; from: Date; to?: Date }
export class LocalEventsProviderError extends Error { constructor(message: string, readonly details: { provider: string; municipalityNumber?: string; municipalityUuid?: string; requestUrl?: string; status?: number; statusText?: string; contentType?: string | null; responseBody?: string; cause?: unknown }) { super(message); this.name = 'LocalEventsProviderError' } }
export function serializeError(error: unknown) { if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack, cause: error.cause }; return { value: String(error) } }
export const LOCAL_EVENT_MUNICIPALITIES: Record<string, FriskusMunicipalityConfig> = {
  '1103': { municipalityNumber: '1103', municipalityName: 'Stavanger', name: 'Stavanger', provider: 'friskus-rss', municipalityUuid: 'f76ec1ae-dc3b-4291-bfb9-a4fec0c129fd', publicBaseUrl: 'https://stavanger.friskus.com' },
  '1108': { municipalityNumber: '1108', municipalityName: 'Sandnes', name: 'Sandnes', provider: 'friskus-rss', municipalityUuid: '0bd3975e-d570-48b5-9ec2-89763bb1d25f', publicBaseUrl: 'https://sandnes.friskus.com' },
} as const
export const FRISKUS_MUNICIPALITIES = LOCAL_EVENT_MUNICIPALITIES

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }
type FeedItem = Record<string, any>
type FetchResult = { rows: FeedItem[]; channelTitle: string | null; status: number; statusText: string; contentType: string | null; requestUrl: string; finalUrl: string; redirected: boolean; bodyPreview: string }
type FriskusOccurrence = { title: string; startsAt: string | null; endsAt: string | null }
const responseCache = new Map<string, { at: number; result: FetchResult }>()
const CACHE_MS = 30 * 60 * 1000

function decodeXml(s: string) { return s.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'") }
function parseAttrs(s: string) { const attrs: Record<string,string> = {}; let i = 0; while (i < s.length) { while (/\s/.test(s[i] || '')) i++; let k = ''; while (i < s.length && !/[\s=]/.test(s[i])) k += s[i++]; while (/\s/.test(s[i] || '')) i++; if (s[i] !== '=') continue; i++; while (/\s/.test(s[i] || '')) i++; const q = s[i]; if (q !== '"' && q !== "'") continue; i++; let v = ''; while (i < s.length && s[i] !== q) v += s[i++]; i++; if (k) attrs[k] = decodeXml(v) } return attrs }
export function parseXml(xml: string): XmlNode { const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' }; const stack = [root]; let i = 0; while (i < xml.length) { const lt = xml.indexOf('<', i); if (lt < 0) { stack.at(-1)!.text += decodeXml(xml.slice(i)); break } stack.at(-1)!.text += decodeXml(xml.slice(i, lt)); if (xml.startsWith('<!--', lt)) { const end = xml.indexOf('-->', lt + 4); if (end < 0) throw new Error('Malformed XML comment'); i = end + 3; continue } if (xml.startsWith('<![CDATA[', lt)) { const end = xml.indexOf(']]>', lt + 9); if (end < 0) throw new Error('Malformed XML CDATA'); stack.at(-1)!.text += xml.slice(lt + 9, end); i = end + 3; continue } const gt = xml.indexOf('>', lt + 1); if (gt < 0) throw new Error('Malformed XML tag'); let tag = xml.slice(lt + 1, gt).trim(); if (tag.startsWith('?') || tag.startsWith('!')) { i = gt + 1; continue } if (tag.startsWith('/')) { const name = tag.slice(1).trim(); const node = stack.pop(); if (!node || node.name !== name) throw new Error(`Malformed XML closing tag: ${name}`); i = gt + 1; continue } const selfClosing = tag.endsWith('/'); if (selfClosing) tag = tag.slice(0, -1).trim(); const space = tag.search(/\s/); const name = space < 0 ? tag : tag.slice(0, space); const node = { name, attrs: space < 0 ? {} : parseAttrs(tag.slice(space + 1)), children: [], text: '' }; stack.at(-1)!.children.push(node); if (!selfClosing) stack.push(node); i = gt + 1 } if (stack.length !== 1) throw new Error('Malformed XML: unclosed tags'); return root }
function children(node: XmlNode, name: string) { return node.children.filter((c) => c.name === name) }
function child(node: XmlNode, name: string) { return children(node, name)[0] }
function value(node: XmlNode | undefined) { return (node?.text || '').replace(/\s+/g, ' ').trim() }
function itemToObject(node: XmlNode): FeedItem { const out: FeedItem = { _attrs: node.attrs }; for (const c of node.children) { const val = c.children.length ? { _text: value(c), _attrs: c.attrs, _children: c.children.map(itemToObject) } : value(c); if (out[c.name] === undefined) out[c.name] = val; else out[c.name] = Array.isArray(out[c.name]) ? [...out[c.name], val] : [out[c.name], val] } return out }
export function extractRssItems(xml: string) { const doc = parseXml(xml); const rss = child(doc, 'rss') || child(doc, 'feed'); const channel = rss ? (child(rss, 'channel') || rss) : doc; const items = [...children(channel, 'item'), ...children(channel, 'entry')].map(itemToObject); return { channelTitle: value(child(channel, 'title')) || null, rows: items } }
function text(v: unknown, max = 500) { const s = typeof v === 'object' && v && '_text' in v ? String((v as any)._text) : String(v ?? ''); return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) }
function dateValue(...vals: unknown[]) { for (const v of vals) { const raw = text(v, 120); if (!raw) continue; const d = new Date(raw); if (Number.isFinite(d.getTime())) return raw } return null }

const NORWEGIAN_MONTHS: Record<string, number> = {
  jan: 1, januar: 1,
  feb: 2, februar: 2,
  mar: 3, mars: 3,
  apr: 4, april: 4,
  mai: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  okt: 10, oktober: 10,
  nov: 11, november: 11,
  des: 12, desember: 12,
}
const NORWEGIAN_WEEKDAYS = '(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|lordag|søndag|sondag)'
const TITLE_DATE_RE = new RegExp(`(?:${NORWEGIAN_WEEKDAYS}\\s+)?(\\d{1,2})\\.\\s*([a-zæøå]+)\\s+(\\d{4})`, 'iu')
const TITLE_TIME_RE = /(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?/

function osloOffsetForDate(year: number, month: number, day: number, hour: number, minute: number) {
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', timeZoneName: 'shortOffset' }).formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value || 'GMT+1'
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return '+01:00'
  return `${m[1]}${m[2].padStart(2, '0')}:${(m[3] || '00').padStart(2, '0')}`
}

function osloIso(year: number, month: number, day: number, time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${osloOffsetForDate(year, month, day, hour, minute)}`
}

export function parseFriskusTitleOccurrence(title: string) {
  const match = TITLE_DATE_RE.exec(title)
  if (!match) return null
  const day = Number(match[1])
  const month = NORWEGIAN_MONTHS[match[2].toLowerCase()]
  const year = Number(match[3])
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null
  const afterDate = title.slice((match.index || 0) + match[0].length)
  const timeMatch = TITLE_TIME_RE.exec(afterDate)
  if (!timeMatch) return null
  const startTime = timeMatch[1]
  const endTime = timeMatch[2] || null
  const cleanTitle = title.slice(0, match.index).replace(/[\s,–—-]+$/g, '').trim() || title
  return {
    title: cleanTitle || title,
    startsAt: osloIso(year, month, day, startTime),
    endsAt: endTime ? osloIso(year, month, day, endTime) : null,
  }
}


const RELIGIOUS_LOCAL_EVENT_RE = /\b(?:gudstjeneste|høymesse|hoeymesse|messe|bønnemøte|bonnemote|bønnestund|bonnestund|bibelgruppe|bibelstudium|andakt|nattverd|lovsang|trosopplæring|trosopplaering|søndagsskole|sondagsskole|menighetsmøte|menighetsmote|religiøs\s+samling|religios\s+samling|koranundervisning|mosk[ée]bønn|mosk[ée]bonn)\b/iu
const CHRISTMAS_EVE_SERVICE_RE = /\b(?:julaftens?gudstjeneste|julegudstjeneste|gudstjeneste|høymesse|hoeymesse|messe)\b/iu

type ReligiousLocalEventInput = { title?: unknown; originalTitle?: unknown; category?: unknown; description?: unknown; short_description?: unknown; raw?: Record<string, unknown> }
function fieldText(...values: unknown[]) { return values.map((v) => text(v, 500)).filter(Boolean).join(' \n ') }
function osloMonthDay(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value
  return { month: Number(get('month')), day: Number(get('day')) }
}
export function isReligiousLocalEvent(event: ReligiousLocalEventInput): boolean {
  const raw = event.raw || {}
  const searchable = fieldText(event.title, event.originalTitle, event.category, event.description, event.short_description, raw.title, raw.category, raw['friskus:category'], raw.description, raw.summary)
  return RELIGIOUS_LOCAL_EVENT_RE.test(searchable)
}
export function isChristmasEveService(event: ReligiousLocalEventInput, occurrence: { startsAt?: string | null; starts_at?: string | null }): boolean {
  const monthDay = osloMonthDay(occurrence.startsAt || occurrence.starts_at)
  if (monthDay?.month !== 12 || monthDay.day !== 24) return false
  const raw = event.raw || {}
  const searchable = fieldText(event.title, event.originalTitle, event.category, event.description, event.short_description, raw.title, raw.category, raw['friskus:category'], raw.description, raw.summary)
  return CHRISTMAS_EVE_SERVICE_RE.test(searchable)
}

function stableBaseId(m: string, url: string, title: string) { return `friskus-rss:${crypto.createHash('sha256').update(`friskus-rss|${m}|${url}|${title}`).digest('hex').slice(0, 24)}` }
function occurrenceId(baseEventId: string, start: string) { return `${baseEventId}:${start}` }
export function startOfTodayInOslo(now = new Date()) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); const g=(t:string)=>p.find(x=>x.type===t)?.value; return new Date(`${g('year')}-${g('month')}-${g('day')}T00:00:00+02:00`) }
export function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d }
export function endOfDayInOslo(date: Date) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const g=(t:string)=>p.find(x=>x.type===t)?.value; return new Date(`${g('year')}-${g('month')}-${g('day')}T23:59:59.999+02:00`) }
function occurrence(raw:any, title: string): FriskusOccurrence { const fromTitle = parseFriskusTitleOccurrence(title); if (fromTitle) return fromTitle; return { title, startsAt: dateValue(raw['friskus:start'], raw['friskus:startDate'], raw['friskus:start_at'], raw.start, raw.startDate, raw['dc:date']), endsAt: dateValue(raw['friskus:end'], raw['friskus:endDate'], raw['friskus:end_at'], raw.end, raw.endDate) } }
function rawArray(value: unknown): unknown[] { return Array.isArray(value) ? value : value == null ? [] : [value] }
function occurrenceCandidates(raw: any, title: string): FriskusOccurrence[] {
  const explicitStarts = ['friskus:participationDate', 'friskus:participation_date', 'friskus:occurrence', 'friskus:occurrences', 'participationDate', 'participationDates', 'occurrence', 'occurrences', 'eventDates'].flatMap((key) => rawArray(raw[key]))
  const expanded = explicitStarts.map((entry) => ({ title, startsAt: dateValue(entry, (entry as any)?.start, (entry as any)?.starts_at, (entry as any)?.startAt, (entry as any)?.date), endsAt: dateValue((entry as any)?.end, (entry as any)?.ends_at, (entry as any)?.endAt) })).filter((x) => x.startsAt)
  return expanded.length ? expanded : [occurrence(raw, title)]
}
export function normalizeFriskusEvents(rows: FeedItem[], fetchedAt: string, from: Date, to: Date, config: FriskusMunicipalityConfig) { let removedMissingTitle=0, removedInvalidDate=0, duplicateGuid=0, removedReligious=0, removedByDate=0; const seen = new Set<string>(); const normalized: NormalizedLocalEvent[] = []; for (const raw of rows) { const rawTitle = text(raw.title, 220); if (!rawTitle) { removedMissingTitle++; continue } const sourceUrl = text(raw.link, 500) || config.publicBaseUrl; const guid = text(raw.guid || raw.id, 200); const baseEventId = guid ? `friskus-rss:${guid}` : stableBaseId(config.municipalityNumber, sourceUrl, rawTitle); for (const occ of occurrenceCandidates(raw, rawTitle)) { const title = text(occ.title, 160); if (!occ.startsAt) { removedInvalidDate++; continue } const eventStart = new Date(occ.startsAt); const effectiveEnd = new Date(occ.endsAt || occ.startsAt); if (effectiveEnd < from || eventStart > to) { removedByDate++; continue } const religiousEvent = { title, originalTitle: rawTitle, category: raw.category || raw['friskus:category'], description: raw.description || raw.summary, raw }; if (isReligiousLocalEvent(religiousEvent) && !isChristmasEveService(religiousEvent, occ)) { removedReligious++; continue } const external_id = occurrenceId(baseEventId, occ.startsAt); if (seen.has(external_id)) { duplicateGuid++; continue } seen.add(external_id); normalized.push({ external_id, title, starts_at: occ.startsAt, ends_at: occ.endsAt, location: text(raw['friskus:location'] || raw.location || raw['friskus:venue'], 140) || null, short_description: text(raw.description || raw.summary, 280) || null, organizer: text(raw.author || raw['dc:creator'], 160) || null, category: null, source_url: sourceUrl, municipality_number: config.municipalityNumber, source: 'friskus-rss', provider: 'friskus-rss', last_fetched_at: fetchedAt, raw: { ...raw, base_event_id: baseEventId } }) } } normalized.sort((a,b)=>a.starts_at.localeCompare(b.starts_at)); return { dateFiltered: normalized, normalized, diagnostics: { removedMissingTitle, removedInvalidDate, duplicateGuid, removedReligious, removedByDate } } }

function mergeDetailOccurrenceDates(raw: FeedItem, html: string) {
  const sourceDates = new Set<string>()
  for (const match of html.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g)) sourceDates.add(match[0])
  const starts = Array.from(sourceDates).filter((value) => Number.isFinite(new Date(value).getTime()))
  if (starts.length <= 1) return raw
  return { ...raw, participationDates: starts.map((start) => ({ start })) }
}
async function fetchFriskusDetailOccurrences(rows: FeedItem[]) {
  return Promise.all(rows.map(async (row) => {
    const url = text(row.link, 500)
    if (!url || !/^https:\/\/[^/]+\.friskus\.com\//.test(url)) return row
    try {
      const resp = await fetch(url, { headers: { Accept: 'text/html, application/xhtml+xml', 'User-Agent': 'RE-MIND/1.0 local-events integration' }, signal: AbortSignal.timeout(10_000), next: { revalidate: 1800 } as any })
      if (!resp.ok) return row
      return mergeDetailOccurrenceDates(row, await resp.text())
    } catch {
      return row
    }
  }))
}

export function friskusRssEndpoint(config: FriskusMunicipalityConfig) { const url = new URL('https://rss.friskus.com/feed/events'); url.searchParams.append('municipalities[]', config.municipalityUuid); return url.toString() }
async function fetchFriskusRows(config: FriskusMunicipalityConfig): Promise<FetchResult> { const requestUrl = friskusRssEndpoint(config); const cached = responseCache.get(requestUrl); if (cached && Date.now() - cached.at < CACHE_MS) return cached.result; let resp: Response; try { resp = await fetch(requestUrl, { method: 'GET', headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'RE-MIND/1.0 local-events integration' }, signal: AbortSignal.timeout(15_000), next: { revalidate: 1800 } as any }) } catch (error) { throw new LocalEventsProviderError('Friskus RSS network request failed', { provider: 'friskus-rss', municipalityNumber: config.municipalityNumber, municipalityUuid: config.municipalityUuid, requestUrl, cause: error }) } const contentType = resp.headers.get('content-type'); const xml = await resp.text(); const base = { municipalityNumber: config.municipalityNumber, municipalityUuid: config.municipalityUuid, requestUrl, status: resp.status, statusText: resp.statusText, contentType, xmlPreview: xml.slice(0,1000) }; console.info('[local-events] Friskus RSS response', base); if (!resp.ok) throw new LocalEventsProviderError(`Friskus RSS returned ${resp.status} ${resp.statusText}`, { provider: 'friskus-rss', municipalityNumber: config.municipalityNumber, municipalityUuid: config.municipalityUuid, requestUrl, status: resp.status, statusText: resp.statusText, contentType, responseBody: xml.slice(0,1000) }); try { const { rows, channelTitle } = extractRssItems(xml); console.info('[local-events] Friskus RSS raw items', { ...base, channelTitle, rawItemCount: rows.length, sanitizedSampleRssItem: rows[0] || null }); const result = { rows, channelTitle, status: resp.status, statusText: resp.statusText, contentType, requestUrl, finalUrl: resp.url, redirected: resp.redirected, bodyPreview: xml.slice(0,1000) }; responseCache.set(requestUrl, { at: Date.now(), result }); return result } catch (error) { throw new LocalEventsProviderError('Friskus RSS XML parsing failed', { provider: 'friskus-rss', municipalityNumber: config.municipalityNumber, municipalityUuid: config.municipalityUuid, requestUrl, status: resp.status, statusText: resp.statusText, contentType, responseBody: xml.slice(0,1000), cause: error }) } }
export async function getLocalEvents({ municipalityNumber, from, to }: GetLocalEventsOptions) { const config = FRISKUS_MUNICIPALITIES[municipalityNumber]; if (!config) throw new Error('Unsupported municipality'); const rangeStart = startOfTodayInOslo(from); const rangeEnd = endOfDayInOslo(to || addDays(rangeStart, 90)); const result = await fetchFriskusRows(config); const rows = await fetchFriskusDetailOccurrences(result.rows); const out = normalizeFriskusEvents(rows, new Date().toISOString(), rangeStart, rangeEnd, config); console.info('[local-events] Friskus RSS normalization diagnostics', { municipalityNumber, municipalityUuid: config.municipalityUuid, requestUrl: result.requestUrl, status: result.status, contentType: result.contentType, xmlPreview: result.bodyPreview, feedItemCount: result.rows.length, normalizedRecordCount: out.normalized.length, ...out.diagnostics, sampleNormalizedEvent: out.normalized[0] ? { title: out.normalized[0].title, startAt: out.normalized[0].starts_at, endAt: out.normalized[0].ends_at, sourceUrl: out.normalized[0].source_url } : null }); return out.normalized }
export async function debugLocalEvents(municipalityNumber: string, from = new Date()) { const config = FRISKUS_MUNICIPALITIES[municipalityNumber]; if (!config) throw new Error('Unsupported municipality'); const result = await fetchFriskusRows(config); const rangeStart = startOfTodayInOslo(from); const rangeEnd = endOfDayInOslo(addDays(rangeStart, 90)); const out = normalizeFriskusEvents(result.rows, new Date().toISOString(), rangeStart, rangeEnd, config); return { municipalityNumber: config.municipalityNumber, municipalityName: config.municipalityName, provider: 'friskus-rss' as const, requestUrl: result.requestUrl, requestSucceeded: true, status: result.status, statusText: result.statusText, contentType: result.contentType, redirected: result.redirected, finalUrl: result.finalUrl, bodyPreview: result.bodyPreview, channelTitle: result.channelTitle, rawCount: result.rows.length, filteredCount: out.dateFiltered.length, normalizedCount: out.normalized.length, sampleRawEvent: result.rows[0] || null, sampleNormalizedEvent: out.normalized[0] || null, diagnostics: out.diagnostics } }
