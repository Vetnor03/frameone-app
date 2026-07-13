export type LocalEventPlaceId =
  | 'stavanger'
  | 'sola'
  | 'sandnes'
  | 'randaberg'
  | 'bryne'
  | 'ha'
  | 'algard'
  | 'egersund'
  | 'jossingfjorden'
  | 'jorpeland'
  | 'tau'
  | 'strand'
  | 'rennesoy'
  | 'kvitsoy'
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

export const LOCAL_EVENT_PLACE_CATALOGUE: readonly LocalEventPlace[] = [
  { id: 'stavanger', displayName: 'Stavanger', sourceName: 'Stavanger', sourceSlug: 'stavanger' },
  { id: 'sola', displayName: 'Sola', sourceName: 'Sola', sourceSlug: 'sola' },
  { id: 'sandnes', displayName: 'Sandnes', sourceName: 'Sandnes', sourceSlug: 'sandnes' },
  { id: 'randaberg', displayName: 'Randaberg', sourceName: 'Randaberg', sourceSlug: 'randaberg' },
  { id: 'bryne', displayName: 'Bryne', sourceName: 'Bryne', sourceSlug: 'bryne' },
  { id: 'ha', displayName: 'Hå', sourceName: 'Hå', sourceSlug: 'ha' },
  { id: 'algard', displayName: 'Ålgård', sourceName: 'Ålgård', sourceSlug: 'algard' },
  { id: 'egersund', displayName: 'Egersund', sourceName: 'Egersund', sourceSlug: 'egersund' },
  { id: 'jossingfjorden', displayName: 'Jøssingfjorden', sourceName: 'Jøssingfjorden', sourceSlug: 'jossingfjorden' },
  { id: 'jorpeland', displayName: 'Jørpeland', sourceName: 'Jørpeland', sourceSlug: 'jorpeland' },
  { id: 'tau', displayName: 'Tau', sourceName: 'Tau', sourceSlug: 'tau' },
  { id: 'strand', displayName: 'Strand', sourceName: 'Strand municipality', sourceSlug: 'strand-municipality' },
  { id: 'rennesoy', displayName: 'Rennesøy', sourceName: 'Rennesøy and the green islands', sourceSlug: 'rennesoy-and-the-green-islands' },
  { id: 'kvitsoy', displayName: 'Kvitsøy', sourceName: 'Kvitsøy', sourceSlug: 'kvitsoy' },
  { id: 'byrkjedal', displayName: 'Byrkjedal', sourceName: 'Byrkjedal', sourceSlug: 'byrkjedal' },
  { id: 'dirdal', displayName: 'Dirdal', sourceName: 'Dirdal', sourceSlug: 'dirdal' },
  { id: 'sirdal', displayName: 'Sirdal', sourceName: 'Sirdal', sourceSlug: 'sirdal' },
  { id: 'florli', displayName: 'Flørli', sourceName: 'Flørli', sourceSlug: 'florli' },
  { id: 'songesand', displayName: 'Songesand', sourceName: 'Songesand', sourceSlug: 'songesand' },
  { id: 'nesflaten', displayName: 'Nesflaten', sourceName: 'Nesflaten', sourceSlug: 'nesflaten' },
] as const

export const NEARBY_LOCAL_EVENT_PLACES: Record<LocalEventPlaceId, readonly LocalEventPlaceId[]> = {
  stavanger: ['stavanger', 'sola', 'sandnes', 'randaberg'],
  sola: ['sola', 'stavanger', 'sandnes', 'randaberg'],
  sandnes: ['sandnes', 'sola', 'stavanger', 'algard'],
  randaberg: ['randaberg', 'stavanger', 'sola', 'rennesoy'],
  bryne: ['bryne', 'ha', 'algard', 'sandnes'],
  ha: ['ha', 'bryne', 'egersund', 'algard'],
  algard: ['algard', 'sandnes', 'bryne', 'byrkjedal'],
  egersund: ['egersund', 'jossingfjorden', 'ha'],
  jossingfjorden: ['jossingfjorden', 'egersund'],
  jorpeland: ['jorpeland', 'tau', 'strand', 'stavanger'],
  tau: ['tau', 'jorpeland', 'strand', 'stavanger'],
  strand: ['strand', 'tau', 'jorpeland', 'stavanger'],
  rennesoy: ['rennesoy', 'randaberg', 'stavanger', 'kvitsoy'],
  kvitsoy: ['kvitsoy', 'rennesoy', 'randaberg', 'stavanger'],
  byrkjedal: ['byrkjedal', 'dirdal', 'algard', 'sirdal'],
  dirdal: ['dirdal', 'byrkjedal', 'algard', 'sirdal'],
  sirdal: ['sirdal', 'byrkjedal', 'dirdal'],
  florli: ['florli', 'songesand', 'jorpeland'],
  songesand: ['songesand', 'florli', 'jorpeland', 'tau'],
  nesflaten: ['nesflaten'],
} as const

const placeById = new Map(LOCAL_EVENT_PLACE_CATALOGUE.map((place) => [place.id, place]))
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
  const primary = getLocalEventPlace(primaryPlaceId)?.id || 'stavanger'
  return { primaryPlaceId: primary, includedPlaceIds: uniqueLocalEventPlaceIds(NEARBY_LOCAL_EVENT_PLACES[primary]) }
}

export function normalizeLocalEventAreaPreference(value: unknown): LocalEventAreaPreference | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { primaryPlaceId?: unknown; includedPlaceIds?: unknown }
  if (typeof record.primaryPlaceId !== 'string') return null
  const primary = getLocalEventPlace(record.primaryPlaceId)?.id
  if (!primary) return null
  const included = uniqueLocalEventPlaceIds(Array.isArray(record.includedPlaceIds) ? record.includedPlaceIds.map(String) : [])
  if (!included.includes(primary)) included.unshift(primary)
  return { primaryPlaceId: primary, includedPlaceIds: included.length ? included : [primary] }
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
