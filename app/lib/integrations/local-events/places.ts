export type LocalEventProviderSource = 'edge_of_norway' | 'linticket' | string
export type LocalEventAreaKey = string
export type LocalEventPlaceId = string

export type LocalEventAreaPreference = {
  primaryPlaceId: LocalEventAreaKey
  includedPlaceIds: LocalEventAreaKey[]
}

export type LocalEventSourceLocation = {
  label: string
  sourceSlug: string
}

export type LocalEventCanonicalLocation = {
  id: string
  name: string
  displayName: string
  normalizedName: string
  municipality?: string
  municipalityNumber?: string
  county?: string
  countryCode: 'NO'
  latitude?: number
  longitude?: number
  aliases: string[]
  activeEventCount: number
  nextEventAt: string | null
  sources: LocalEventProviderSource[]
  sourceLocations: readonly LocalEventSourceLocation[]
  parentIds?: string[]
  isVenue?: boolean
}

export type LocalEventPlace = LocalEventCanonicalLocation

type SeedLocation = Omit<LocalEventCanonicalLocation, 'normalizedName' | 'displayName' | 'activeEventCount' | 'nextEventAt' | 'countryCode' | 'sources' | 'sourceLocations' | 'aliases'> & {
  aliases?: string[]
  sourceLocations?: readonly string[]
  suggestedNearby?: readonly string[]
  sources?: LocalEventProviderSource[]
}

const EDGE_OF_NORWAY_SOURCE: LocalEventProviderSource = 'edge_of_norway'

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

export const normalizeLocalEventLocationName = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(kommune|municipality)\b/g, '')
  .replace(/[^a-z0-9æøå]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')

const seeds: SeedLocation[] = [
  { id: 'stavanger', name: 'Stavanger', municipality: 'Stavanger', municipalityNumber: '1103', county: 'Rogaland', latitude: 58.9701, longitude: 5.7333, aliases: ['Stavanger kommune'], sourceLocations: ['Stavanger'], suggestedNearby: ['sola', 'sandnes', 'randaberg'] },
  { id: 'sandnes', name: 'Sandnes', municipality: 'Sandnes', municipalityNumber: '1108', county: 'Rogaland', latitude: 58.8524, longitude: 5.7352, aliases: ['Sandnes kommune'], sourceLocations: ['Sandnes'], suggestedNearby: ['sola', 'stavanger', 'algard'] },
  { id: 'sola', name: 'Sola', municipality: 'Sola', municipalityNumber: '1124', county: 'Rogaland', latitude: 58.8885, longitude: 5.6528, aliases: ['Sola kommune'], sourceLocations: ['Sola'] },
  { id: 'bryne', name: 'Bryne', municipality: 'Time', municipalityNumber: '1121', county: 'Rogaland', latitude: 58.7354, longitude: 5.6477, aliases: ['Time kommune'], sourceLocations: ['Bryne'] },
  { id: 'egersund', name: 'Egersund', municipality: 'Eigersund', municipalityNumber: '1101', county: 'Rogaland', latitude: 58.4513, longitude: 5.9997, aliases: ['Eigersund', 'Eigersund kommune'], sourceLocations: ['Egersund'] },
  { id: 'randaberg', name: 'Randaberg', municipality: 'Randaberg', municipalityNumber: '1127', county: 'Rogaland', latitude: 58.9996, longitude: 5.6187, aliases: ['Randaberg kommune'] },
  { id: 'rennesoy', name: 'Rennesøy', municipality: 'Stavanger', municipalityNumber: '1103', county: 'Rogaland', latitude: 59.0986, longitude: 5.6997, aliases: ['Rennesøy and the green islands'], sourceLocations: ['Rennesøy and the green islands'], parentIds: ['stavanger'] },
  { id: 'strand', name: 'Strand', municipality: 'Strand', municipalityNumber: '1130', county: 'Rogaland', latitude: 59.0236, longitude: 6.0436, aliases: ['Strand municipality'], sourceLocations: ['Strand municipality'] },
  { id: 'kvitsoy', name: 'Kvitsøy', municipality: 'Kvitsøy', municipalityNumber: '1144', county: 'Rogaland', latitude: 59.0625, longitude: 5.4053, aliases: ['Kvitsøy kommune'], sourceLocations: ['Kvitsøy'] },
  { id: 'algard', name: 'Ålgård', municipality: 'Gjesdal', municipalityNumber: '1122', county: 'Rogaland', latitude: 58.7642, longitude: 5.8525, aliases: ['Algard'], sourceLocations: ['Ålgård'] },
  { id: 'jorpeland', name: 'Jørpeland', municipality: 'Strand', municipalityNumber: '1130', county: 'Rogaland', aliases: ['Jorpeland'], sourceLocations: ['Jørpeland'], parentIds: ['strand'] },
  { id: 'tau', name: 'Tau', municipality: 'Strand', municipalityNumber: '1130', county: 'Rogaland', sourceLocations: ['Tau'], parentIds: ['strand'] },
  { id: 'ha', name: 'Hå', municipality: 'Hå', municipalityNumber: '1119', county: 'Rogaland', aliases: ['Ha', 'Hå kommune'], sourceLocations: ['Hå'] },
  { id: 'sirdal', name: 'Sirdal', municipality: 'Sirdal', municipalityNumber: '4228', county: 'Agder', sourceLocations: ['Sirdal'] },
  { id: 'dirdal', name: 'Dirdal', municipality: 'Gjesdal', municipalityNumber: '1122', county: 'Rogaland', sourceLocations: ['Dirdal'], parentIds: ['algard'] },
  { id: 'byrkjedal', name: 'Byrkjedal', municipality: 'Gjesdal', municipalityNumber: '1122', county: 'Rogaland', sourceLocations: ['Byrkjedal'], parentIds: ['algard'] },
  { id: 'sogndalstrand', name: 'Sogndalstrand', municipality: 'Sokndal', municipalityNumber: '1111', county: 'Rogaland', sourceLocations: ['Sogndalstrand'] },
  { id: 'jossingfjorden', name: 'Jøssingfjorden', municipality: 'Sokndal', municipalityNumber: '1111', county: 'Rogaland', aliases: ['Jossingfjorden'], sourceLocations: ['Jøssingfjorden'] },
]

const edgeSeedIds = new Set(['stavanger', 'sandnes', 'sola', 'bryne', 'egersund', 'randaberg', 'rennesoy', 'strand', 'kvitsoy', 'algard', 'jorpeland', 'tau', 'ha', 'sirdal', 'dirdal', 'byrkjedal', 'sogndalstrand', 'jossingfjorden'])
const suggestedNearbyById = new Map<string, readonly string[]>(seeds.map((seed) => [seed.id, seed.suggestedNearby || []]))

export const LOCAL_EVENT_PLACE_CATALOGUE: readonly LocalEventPlace[] = seeds.map((seed) => ({
  ...seed,
  displayName: seed.name,
  normalizedName: normalizeLocalEventLocationName(seed.name),
  countryCode: 'NO',
  aliases: seed.aliases || [],
  activeEventCount: edgeSeedIds.has(seed.id) || (seed.sources || []).length ? 1 : 0,
  nextEventAt: null,
  sources: seed.sources || (edgeSeedIds.has(seed.id) ? [EDGE_OF_NORWAY_SOURCE] : []),
  sourceLocations: (seed.sourceLocations || [seed.name]).map(sourceLocation),
})) as readonly LocalEventPlace[]

export const LOCAL_EVENT_SOURCE_LOCATIONS_BY_AREA = Object.fromEntries(LOCAL_EVENT_PLACE_CATALOGUE.map((place) => [place.id, place.sourceLocations])) as Record<string, readonly LocalEventSourceLocation[]>

const discoveredLocalEventPlaces: LocalEventPlace[] = []
const placeById = new Map(LOCAL_EVENT_PLACE_CATALOGUE.map((place) => [place.id, place]))
const areaBySourceLabel = new Map<string, string>()
for (const place of LOCAL_EVENT_PLACE_CATALOGUE) for (const location of place.sourceLocations) areaBySourceLabel.set(location.label, place.id)

export function getLocalEventPlace(id: string | null | undefined) { return id ? placeById.get(id) || discoveredLocalEventPlaces.find((place) => place.id === id) || null : null }
export function getLocalEventAreaForSourceLocation(label: string | null | undefined) { return label ? areaBySourceLabel.get(label) || matchCanonicalLocalEventLocation({ name: label })?.id || null : null }

export function matchCanonicalLocalEventLocation(input: { name?: string | null; municipality?: string | null; municipalityNumber?: string | null; county?: string | null; countryCode?: string | null; latitude?: number | null; longitude?: number | null }) {
  if (input.countryCode && input.countryCode.toUpperCase() !== 'NO') return null
  const normalizedName = normalizeLocalEventLocationName(String(input.name || ''))
  if (input.municipalityNumber) {
    const byNumber = LOCAL_EVENT_PLACE_CATALOGUE.find((place) => place.municipalityNumber === input.municipalityNumber && (!normalizedName || place.normalizedName === normalizedName || place.aliases.some((alias) => normalizeLocalEventLocationName(alias) === normalizedName)))
    if (byNumber) return byNumber
  }
  return [...LOCAL_EVENT_PLACE_CATALOGUE, ...discoveredLocalEventPlaces].find((place) => place.normalizedName === normalizedName || place.aliases.some((alias) => normalizeLocalEventLocationName(alias) === normalizedName)) || null
}

export function searchLocalEventPlaces(query: string) {
  const normalizedQuery = normalizeLocalEventLocationName(query)
  const places = [...LOCAL_EVENT_PLACE_CATALOGUE, ...discoveredLocalEventPlaces].filter((place) => !place.isVenue && place.activeEventCount > 0)
  if (!normalizedQuery) return places
  const exact = places.filter((place) => place.normalizedName === normalizedQuery || place.aliases.some((alias) => normalizeLocalEventLocationName(alias) === normalizedQuery))
  if (exact.length) return exact.sort((a, b) => b.activeEventCount - a.activeEventCount || a.name.localeCompare(b.name, 'nb'))
  return places
    .filter((place) => [place.name, ...place.aliases, ...(normalizedQuery.length >= 5 ? [place.municipality, place.county] : [])].filter(Boolean).some((value) => normalizeLocalEventLocationName(String(value)).includes(normalizedQuery)))
    .sort((a, b) => b.activeEventCount - a.activeEventCount || a.name.localeCompare(b.name, 'nb'))
}

export function uniqueLocalEventPlaceIds(ids: readonly string[]) {
  const seen = new Set<string>()
  for (const id of ids) if (getLocalEventPlace(id)) seen.add(id)
  return Array.from(seen)
}

export function upsertDiscoveredLocalEventLocation(input: { name: string; municipality?: string | null; county?: string | null; countryCode?: string | null; latitude?: number | null; longitude?: number | null; source: LocalEventProviderSource; nextEventAt?: string | null }) {
  if (!input.name || (input.countryCode && input.countryCode.toUpperCase() !== 'NO')) return null
  const existing = matchCanonicalLocalEventLocation({ name: input.name, municipality: input.municipality, county: input.county, countryCode: 'NO', latitude: input.latitude, longitude: input.longitude })
  const target = existing || discoveredLocalEventPlaces.find((place) => place.normalizedName === normalizeLocalEventLocationName(input.name))
  if (target) {
    if (!target.sources.includes(input.source)) target.sources.push(input.source)
    target.activeEventCount += 1
    if (input.nextEventAt && (!target.nextEventAt || input.nextEventAt < target.nextEventAt)) target.nextEventAt = input.nextEventAt
    return target
  }
  const id = normalizeLocalEventLocationName(input.name).replace(/\s+/g, '-')
  const created: LocalEventPlace = { id, name: input.name, displayName: input.name, normalizedName: normalizeLocalEventLocationName(input.name), municipality: input.municipality || input.name, county: input.county || undefined, countryCode: 'NO', latitude: input.latitude || undefined, longitude: input.longitude || undefined, aliases: [], activeEventCount: 1, nextEventAt: input.nextEventAt || null, sources: [input.source], sourceLocations: [] }
  discoveredLocalEventPlaces.push(created)
  return created
}

export function suggestedLocalEventArea(primaryPlaceId: string): LocalEventAreaPreference {
  const primary = getLocalEventPlace(primaryPlaceId)?.id || 'stavanger'
  return { primaryPlaceId: primary, includedPlaceIds: uniqueLocalEventPlaceIds([primary, ...(suggestedNearbyById.get(primary) || [])]) }
}

export function normalizeLocalEventAreaPreference(value: unknown): LocalEventAreaPreference | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { primaryPlaceId?: unknown; includedPlaceIds?: unknown }
  if (typeof record.primaryPlaceId !== 'string') return null
  const primary = getLocalEventPlace(record.primaryPlaceId)?.id
  if (!primary) return null
  const requested = Array.isArray(record.includedPlaceIds) ? record.includedPlaceIds.filter((id): id is string => typeof id === 'string') : []
  return { primaryPlaceId: primary, includedPlaceIds: uniqueLocalEventPlaceIds([primary, ...requested]) }
}

export function formatLocalEventPlaceList(ids: readonly string[]) {
  const names = uniqueLocalEventPlaceIds(ids).map((id) => getLocalEventPlace(id)?.displayName).filter(Boolean) as string[]
  if (names.length <= 2) return names.join(names.length === 2 ? ' and ' : '')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function buildEdgeOfNorwayEventsUrlForSourceLocations(sourceLocations: readonly LocalEventSourceLocation[]) {
  const url = new URL('https://www.edgeofnorway.com/en/events')
  url.searchParams.set('date', 'next_30')
  url.searchParams.set('filtertype', 'place')
  for (const location of sourceLocations) url.searchParams.append('place', location.sourceSlug)
  return url.toString()
}

export function buildEdgeOfNorwayEventsUrlForPlaceIds(placeIds: readonly string[]) {
  const sourceLocations = uniqueLocalEventPlaceIds(placeIds).flatMap((id) => Array.from(LOCAL_EVENT_SOURCE_LOCATIONS_BY_AREA[id] || []))
  return buildEdgeOfNorwayEventsUrlForSourceLocations(sourceLocations)
}

export function buildEdgeOfNorwayEventsUrlForSourceLocation(sourceLocation: LocalEventSourceLocation) { return buildEdgeOfNorwayEventsUrlForSourceLocations([sourceLocation]) }
export const DEFAULT_LOCAL_EVENT_AREA = suggestedLocalEventArea('stavanger')
