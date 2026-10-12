// Smoke check the official Kartverket endpoint used by Events place search.
const url = new URL('https://ws.geonorge.no/stedsnavn/v1/navn')
url.searchParams.set('sok', 'Stavanger*')
url.searchParams.set('koordsys', '4326')
url.searchParams.set('treffPerSide', '2')
url.searchParams.set('side', '1')
const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
if (!response.ok) throw new Error('Kartverket HTTP ' + response.status)
const data = await response.json()
const sample = Array.isArray(data.navn) ? data.navn[0] : undefined
if (!sample) throw new Error('No Kartverket place results')
console.log('Kartverket response fields:', Object.keys(sample).join(', '))
console.log('First place sample:', JSON.stringify(sample).slice(0, 1500))
