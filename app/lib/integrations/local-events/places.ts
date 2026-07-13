export type LocalEventPlaceId =
  | 'stavanger'
  | 'randaberg'
  | 'rennesoy'
  | 'finnoy'
  | 'kvitsoy'
  | 'sandnes'
  | 'hommersak'
  | 'forsand'
  | 'sola'
  | 'tananger'
  | 'bryne'
  | 'klepp'
  | 'time'
  | 'naerbo'
  | 'varhaug'
  | 'egersund'
  | 'bjerkreim'
  | 'sokndal'
  | 'haugesund'
  | 'karmoy'
  | 'tysvaer'
  | 'sveio'
  | 'ha'
  | 'algard'
  | 'jossingfjorden'
  | 'jorpeland'
  | 'tau'
  | 'strand'
  | 'byrkjedal'
  | 'dirdal'
  | 'sirdal'
  | 'florli'
  | 'songesand'
  | 'nesflaten'

export type LocalEventAreaPreference = {
  primaryPlaceId: LocalEventPlaceId
  includedPlaceIds: LocalEventPlaceId[]
}

export type LocalEventPlace = {
  id: LocalEventPlaceId
  displayName: string
  sourceName: string
  sourceSlug: string
}

export const LOCAL_EVENT_MAIN_PLACE_IDS = ['stavanger', 'sandnes', 'sola', 'bryne', 'egersund', 'haugesund'] as const satisfies readonly LocalEventPlaceId[]

const LOCAL_EVENT_SOURCE_PLACE_CATALOGUE: readonly LocalEventPlace[] = [
  { id: 'stavanger', displayName: 'Stavanger', sourceName: 'Stavanger', sourceSlug: 'stavanger' },
  { id: 'randaberg', displayName: 'Randaberg', sourceName: 'Randaberg', sourceSlug: 'randaberg' },
  { id: 'rennesoy', displayName: 'Rennesøy', sourceName: 'Rennesøy and the green islands', sourceSlug: 'rennesoy-and-the-green-islands' },
  { id: 'finnoy', displayName: 'Finnøy', sourceName: 'Finnøy', sourceSlug: 'finnoy' },
  { id: 'kvitsoy', displayName: 'Kvitsøy', sourceName: 'Kvitsøy', sourceSlug: 'kvitsoy' },
  { id: 'sandnes', displayName: 'Sandnes', sourceName: 'Sandnes', sourceSlug: 'sandnes' },
  { id: 'hommersak', displayName: 'Hommersåk', sourceName: 'Hommersåk', sourceSlug: 'hommersak' },
  { id: 'forsand', displayName: 'Forsand', sourceName: 'Forsand', sourceSlug: 'forsand' },
  { id: 'sola', displayName: 'Sola', sourceName: 'Sola', sourceSlug: 'sola' },
  { id: 'tananger', displayName: 'Tananger', sourceName: 'Tananger', sourceSlug: 'tananger' },
  { id: 'bryne', displayName: 'Bryne', sourceName: 'Bryne', sourceSlug: 'bryne' },
  { id: 'klepp', displayName: 'Klepp', sourceName: 'Klepp', sourceSlug: 'klepp' },
  { id: 'time', displayName: 'Time', sourceName: 'Time', sourceSlug: 'time' },
  { id: 'naerbo', displayName: 'Nærbø', sourceName: 'Nærbø', sourceSlug: 'naerbo' },
  { id: 'varhaug', displayName: 'Varhaug', sourceName: 'Varhaug', sourceSlug: 'varhaug' },
  { id: 'egersund', displayName: 'Egersund', sourceName: 'Egersund', sourceSlug: 'egersund' },
  { id: 'bjerkreim', displayName: 'Bjerkreim', sourceName: 'Bjerkreim', sourceSlug: 'bjerkreim' },
  { id: 'sokndal', displayName: 'Sokndal', sourceName: 'Sokndal', sourceSlug: 'sokndal' },
  { id: 'haugesund', displayName: 'Haugesund', sourceName: 'Haugesund', sourceSlug: 'haugesund' },
  { id: 'karmoy', displayName: 'Karmøy', sourceName: 'Karmøy', sourceSlug: 'karmoy' },
  { id: 'tysvaer', displayName: 'Tysvær', sourceName: 'Tysvær', sourceSlug: 'tysvaer' },
  { id: 'sveio', displayName: 'Sveio', sourceName: 'Sveio', sourceSlug: 'sveio' },
  { id: 'ha', displayName: 'Hå', sourceName: 'Hå', sourceSlug: 'ha' },
  { id: 'algard', displayName: 'Ålgård', sourceName: 'Ålgård', sourceSlug: 'algard' },
  { id: 'jossingfjorden', displayName: 'Jøssingfjorden', sourceName: 'Jøssingfjorden', sourceSlug: 'jossingfjorden' },
  { id: 'jorpeland', displayName: 'Jørpeland', sourceName: 'Jørpeland', sourceSlug: 'jorpeland' },
  { id: 'tau', displayName: 'Tau', sourceName: 'Tau', sourceSlug: 'tau' },
  { id: 'strand', displayName: 'Strand', sourceName: 'Strand municipality', sourceSlug: 'strand-municipality' },
  { id: 'byrkjedal', displayName: 'Byrkjedal', sourceName: 'Byrkjedal', sourceSlug: 'byrkjedal' },
  { id: 'dirdal', displayName: 'Dirdal', sourceName: 'Dirdal', sourceSlug: 'dirdal' },
  { id: 'sirdal', displayName: 'Sirdal', sourceName: 'Sirdal', sourceSlug: 'sirdal' },
  { id: 'florli', displayName: 'Flørli', sourceName: 'Flørli', sourceSlug: 'florli' },
  { id: 'songesand', displayName: 'Songesand', sourceName: 'Songesand', sourceSlug: 'songesand' },
  { id: 'nesflaten', displayName: 'Nesflaten', sourceName: 'Nesflaten', sourceSlug: 'nesflaten' },
] as const

const placeById = new Map(LOCAL_EVENT_SOURCE_PLACE_CATALOGUE.map((place) => [place.id, place]))
export const LOCAL_EVENT_PLACE_CATALOGUE: readonly LocalEventPlace[] = LOCAL_EVENT_MAIN_PLACE_IDS.map((id) => placeById.get(id)!).filter(Boolean)

export const NEARBY_LOCAL_EVENT_PLACES: Record<LocalEventPlaceId, readonly LocalEventPlaceId[]> = {
  stavanger: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  randaberg: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  rennesoy: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  finnoy: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  kvitsoy: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  sandnes: ['sandnes', 'hommersak', 'forsand'],
  hommersak: ['sandnes', 'hommersak', 'forsand'],
  forsand: ['sandnes', 'hommersak', 'forsand'],
  sola: ['sola', 'tananger'],
  tananger: ['sola', 'tananger'],
  bryne: ['bryne', 'klepp', 'time', 'naerbo', 'varhaug'],
  klepp: ['bryne', 'klepp', 'time', 'naerbo', 'varhaug'],
  time: ['bryne', 'klepp', 'time', 'naerbo', 'varhaug'],
  naerbo: ['bryne', 'klepp', 'time', 'naerbo', 'varhaug'],
  varhaug: ['bryne', 'klepp', 'time', 'naerbo', 'varhaug'],
  egersund: ['egersund', 'bjerkreim', 'sokndal'],
  bjerkreim: ['egersund', 'bjerkreim', 'sokndal'],
  sokndal: ['egersund', 'bjerkreim', 'sokndal'],
  haugesund: ['haugesund', 'karmoy', 'tysvaer', 'sveio'],
  karmoy: ['haugesund', 'karmoy', 'tysvaer', 'sveio'],
  tysvaer: ['haugesund', 'karmoy', 'tysvaer', 'sveio'],
  sveio: ['haugesund', 'karmoy', 'tysvaer', 'sveio'],
  ha: ['bryne', 'klepp', 'time', 'naerbo', 'varhaug'],
  algard: ['sandnes', 'hommersak', 'forsand'],
  jossingfjorden: ['egersund', 'bjerkreim', 'sokndal'],
  jorpeland: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  tau: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  strand: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  byrkjedal: ['sandnes', 'hommersak', 'forsand'],
  dirdal: ['sandnes', 'hommersak', 'forsand'],
  sirdal: ['sandnes', 'hommersak', 'forsand'],
  florli: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  songesand: ['stavanger', 'randaberg', 'rennesoy', 'finnoy', 'kvitsoy'],
  nesflaten: ['haugesund', 'karmoy', 'tysvaer', 'sveio'],
} as const

const normalizeSearch = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function getLocalEventPlace(id: string | null | undefined) {
  return placeById.get(id as LocalEventPlaceId) || null
}

export function searchLocalEventPlaces(query: string) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return LOCAL_EVENT_PLACE_CATALOGUE
  return LOCAL_EVENT_PLACE_CATALOGUE.filter((place) => normalizeSearch(place.displayName).includes(normalizedQuery))
}

export function uniqueLocalEventPlaceIds(ids: readonly string[]) {
  const seen = new Set<LocalEventPlaceId>()
  for (const id of ids) if (placeById.has(id as LocalEventPlaceId)) seen.add(id as LocalEventPlaceId)
  return Array.from(seen)
}

export function suggestedLocalEventArea(primaryPlaceId: string): LocalEventAreaPreference {
  const requested = getLocalEventPlace(primaryPlaceId)?.id || 'stavanger'
  const primary = (LOCAL_EVENT_MAIN_PLACE_IDS as readonly string[]).includes(requested) ? requested : (NEARBY_LOCAL_EVENT_PLACES[requested]?.[0] || 'stavanger')
  return { primaryPlaceId: primary as LocalEventPlaceId, includedPlaceIds: uniqueLocalEventPlaceIds(NEARBY_LOCAL_EVENT_PLACES[primary as LocalEventPlaceId]) }
}

export function normalizeLocalEventAreaPreference(value: unknown): LocalEventAreaPreference | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { primaryPlaceId?: unknown; includedPlaceIds?: unknown }
  if (typeof record.primaryPlaceId !== 'string') return null
  if (!getLocalEventPlace(record.primaryPlaceId)) return null
  const area = suggestedLocalEventArea(record.primaryPlaceId)
  const included = uniqueLocalEventPlaceIds(Array.isArray(record.includedPlaceIds) ? record.includedPlaceIds.map(String) : [])
  const grouped = included.length ? uniqueLocalEventPlaceIds([...area.includedPlaceIds, ...included]) : area.includedPlaceIds
  if (!grouped.includes(area.primaryPlaceId)) grouped.unshift(area.primaryPlaceId)
  return { primaryPlaceId: area.primaryPlaceId, includedPlaceIds: grouped }
}

export function formatLocalEventPlaceList(ids: readonly string[]) {
  const names = uniqueLocalEventPlaceIds(ids).map((id) => getLocalEventPlace(id)?.displayName).filter(Boolean) as string[]
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function buildEdgeOfNorwayEventsUrlForPlaceIds(placeIds: readonly string[]) {
  const ids = uniqueLocalEventPlaceIds(placeIds)
  const url = new URL('https://www.edgeofnorway.com/en/events')
  url.searchParams.set('date', 'next_30')
  url.searchParams.set('filtertype', 'place')
  for (const id of ids) url.searchParams.append('place', placeById.get(id)!.sourceSlug)
  return url.toString()
}

export const DEFAULT_LOCAL_EVENT_AREA = suggestedLocalEventArea('stavanger')
