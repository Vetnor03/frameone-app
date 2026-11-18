import { safeCity } from './preview.mjs'

function inNorway(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= 57 && latitude <= 82 && longitude >= 4 && longitude <= 33
}
export function verifiedNorwegianPlace(payload, requestedCity) {
  const validName = safeCity(requestedCity)
  if (!validName) throw Error('Enter a Norwegian city name')
  const entries = Array.isArray(payload?.results) ? payload.results : []
  const matches = entries.filter(row =>
    row && row.country_code === 'NO' && inNorway(Number(row.latitude), Number(row.longitude)) &&
    typeof row.name === 'string' && row.name.trim())
  const compare = x => x.normalize('NFKC').toLocaleLowerCase('nb-NO').trim()
  // Never silently select an unrelated town from fuzzy geocoding results.
  const place = matches.find(row => compare(row.name) === compare(validName)) ||
    matches.find(row => compare(row.name).startsWith(compare(validName) + ' '))
  if (!place) throw Error('Could not find this city in Norway. Check the spelling.')
  return { name: place.name.trim(), latitude: Number(place.latitude), longitude: Number(place.longitude) }
}
export async function resolveNorwegianCity(city) {
  const cleanCity = safeCity(city)
  if (!cleanCity) throw Error('Enter a Norwegian city name')
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  for (const [key, value] of Object.entries({ name: cleanCity, count: '10', language: 'no', countryCode: 'NO', format: 'json' }))
    url.searchParams.set(key, value)
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 30 * 24 * 60 * 60 },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw Error('Location lookup unavailable')
  return verifiedNorwegianPlace(await response.json(), cleanCity)
}
