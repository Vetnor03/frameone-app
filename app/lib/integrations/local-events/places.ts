export type LocalEventAreaKey = 'stavanger' | 'sandnes' | 'sola' | 'bryne' | 'egersund'
export type LocalEventPlaceId = LocalEventAreaKey

export type LocalEventAreaPreference = {
  primaryPlaceId: LocalEventAreaKey
  includedPlaceIds: LocalEventAreaKey[]
}

export type LocalEventSourceLocation = {
  label: string
  sourceSlug: string
}

export type LocalEventPlace = {
  id: LocalEventAreaKey
  displayName: string
  sourceLocations: readonly LocalEventSourceLocation[]
}

const slugifySourceLocation = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/æ/g, 'ae')
  .replace(/ø/g, 'o')
  .replace(/å/g, 'a')
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const sourceLocation = (label: string): LocalEventSourceLocation => ({ label, sourceSlug: slugifySourceLocation(label) })

export const LOCAL_EVENT_PLACE_CATALOGUE: readonly LocalEventPlace[] = [
  { id: 'stavanger', displayName: 'Stavanger', sourceLocations: ['Stavanger', 'Sandnes', 'Sola', 'Randaberg', 'Rennesøy and the green islands', 'Kvitsøy', 'Swords in rock', 'Jørpeland', 'Tau', 'Strand municipality', 'Preikestolen'].map(sourceLocation) },
  { id: 'sandnes', displayName: 'Sandnes', sourceLocations: ['Sandnes', 'Stavanger', 'Sola', 'Ålgård', 'Byrkjedal', 'Dirdal'].map(sourceLocation) },
  { id: 'sola', displayName: 'Sola', sourceLocations: ['Sola', 'Stavanger', 'Sandnes', 'Randaberg'].map(sourceLocation) },
  { id: 'bryne', displayName: 'Bryne', sourceLocations: ['Bryne', 'Hå', 'Norwegian Scenic Route Jæren', 'The Jæren beaches', 'Ålgård', 'Sandnes'].map(sourceLocation) },
  { id: 'egersund', displayName: 'Egersund', sourceLocations: ['Egersund', 'Magma UNESCO Global Geopark', 'Jøssingfjorden', 'Sogndalstrand', 'Sirdal', 'Bryne', 'Hå'].map(sourceLocation) },
] as const

export const LOCAL_EVENT_SOURCE_LOCATIONS_BY_AREA = Object.fromEntries(LOCAL_EVENT_PLACE_CATALOGUE.map((place) => [place.id, place.sourceLocations])) as Record<LocalEventAreaKey, readonly LocalEventSourceLocation[]>

const placeById = new Map(LOCAL_EVENT_PLACE_CATALOGUE.map((place) => [place.id, place]))
const areaKeysBySourceLabel = new Map<string, LocalEventAreaKey[]>()
for (const place of LOCAL_EVENT_PLACE_CATALOGUE) {
  for (const location of place.sourceLocations) {
    const existing = areaKeysBySourceLabel.get(location.label) || []
    if (!existing.includes(place.id)) areaKeysBySourceLabel.set(location.label, [...existing, place.id])
  }
}
const normalizeSearch = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function getLocalEventPlace(id: string | null | undefined) {
  return placeById.get(id as LocalEventAreaKey) || null
}

export function getLocalEventAreaKeysForSourceLocation(label: string | null | undefined) {
  return label ? areaKeysBySourceLabel.get(label) || [] : []
}

export function getLocalEventAreaForSourceLocation(label: string | null | undefined) {
  return getLocalEventAreaKeysForSourceLocation(label)[0] || null
}

export function searchLocalEventPlaces(query: string) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return LOCAL_EVENT_PLACE_CATALOGUE
  return LOCAL_EVENT_PLACE_CATALOGUE.filter((place) => normalizeSearch(place.displayName).includes(normalizedQuery))
}

export function uniqueLocalEventPlaceIds(ids: readonly string[]) {
  const seen = new Set<LocalEventAreaKey>()
  for (const id of ids) if (placeById.has(id as LocalEventAreaKey)) seen.add(id as LocalEventAreaKey)
  return Array.from(seen)
}

export function suggestedLocalEventArea(primaryPlaceId: string): LocalEventAreaPreference {
  const primary = getLocalEventPlace(primaryPlaceId)?.id || 'stavanger'
  return { primaryPlaceId: primary, includedPlaceIds: [primary] }
}

export function normalizeLocalEventAreaPreference(value: unknown): LocalEventAreaPreference | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { primaryPlaceId?: unknown }
  if (typeof record.primaryPlaceId !== 'string') return null
  const primary = getLocalEventPlace(record.primaryPlaceId)?.id
  if (!primary) return null
  return { primaryPlaceId: primary, includedPlaceIds: [primary] }
}

export function formatLocalEventPlaceList(ids: readonly string[]) {
  const names = uniqueLocalEventPlaceIds(ids).map((id) => getLocalEventPlace(id)?.displayName).filter(Boolean) as string[]
  return names.join(', ')
}

export function buildEdgeOfNorwayEventsUrlForSourceLocations(sourceLocations: readonly LocalEventSourceLocation[]) {
  const url = new URL('https://www.edgeofnorway.com/en/events')
  url.searchParams.set('date', 'next_30')
  url.searchParams.set('filtertype', 'place')
  for (const location of sourceLocations) url.searchParams.append('place', location.sourceSlug)
  return url.toString()
}

export function uniqueLocalEventSourceLocationsForArea(areaKey: LocalEventAreaKey) {
  const seen = new Set<string>()
  const locations: LocalEventSourceLocation[] = []
  for (const location of LOCAL_EVENT_SOURCE_LOCATIONS_BY_AREA[areaKey]) {
    if (seen.has(location.sourceSlug)) continue
    seen.add(location.sourceSlug)
    locations.push(location)
  }
  return locations
}

export function buildEdgeOfNorwayEventsUrlForPlaceIds(placeIds: readonly string[]) {
  const sourceLocations = uniqueLocalEventPlaceIds(placeIds).flatMap((id) => uniqueLocalEventSourceLocationsForArea(id))
  return buildEdgeOfNorwayEventsUrlForSourceLocations(sourceLocations)
}

export function buildEdgeOfNorwayEventsUrlForSourceLocation(sourceLocation: LocalEventSourceLocation) {
  return buildEdgeOfNorwayEventsUrlForSourceLocations([sourceLocation])
}

export const DEFAULT_LOCAL_EVENT_AREA = suggestedLocalEventArea('stavanger')
