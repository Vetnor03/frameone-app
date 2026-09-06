import test from 'node:test'
import assert from 'node:assert/strict'
import { createHentavfallProvider, createMinRenovasjonProvider, createStavangerProvider, normalizeWasteType, searchKartverketAddresses, WasteProviderError } from '../app/lib/integrations/waste/providers.ts'
import { norwayLocalYmd } from '../app/lib/integrations/waste/date.ts'
import { wasteCollectionDisplayTitle } from '../app/lib/integrations/waste/display.ts'

test('Norwegian canonical today differs from UTC around Oslo midnight', () => {
  const instant = new Date('2026-01-15T23:30:00.000Z')
  assert.equal(instant.toISOString().slice(0, 10), '2026-01-15')
  assert.equal(norwayLocalYmd(instant), '2026-01-16')
})

test('Kartverket autocomplete preserves multiple complete address candidates', async () => {
  const fetcher = async () => Response.json({ adresser: [
    { adressetekst: 'Eksempelgata 12B', adressenavn: 'Eksempelgata', nummer: 12, bokstav: 'B', postnummer: '4000', poststed: 'Stavanger', kommunenummer: '1103', kommunenavn: 'Stavanger', adressekode: 1234, gardsnummer: 16, bruksnummer: 489, seksjonsnummer: 0, representasjonspunkt: { lat: 58.9, lon: 5.7 } },
    { adressetekst: 'Eksempelgata 14', nummer: 14, postnummer: '4000', poststed: 'Stavanger', kommunenummer: '1103', kommunenavn: 'Stavanger', adressekode: 1234 },
  ] })
  const rows = await searchKartverketAddresses('Eksempelgata', fetcher)
  assert.equal(rows.length, 2); assert.equal(rows[0].houseNumber, '12B'); assert.equal(rows[0].label, 'Eksempelgata 12B, 4000 Stavanger'); assert.equal(rows[0].municipalityNumber, '1103'); assert.equal(rows[0].addressCode, '1234'); assert.equal(rows[0].gnr, '16'); assert.equal(rows[0].bnr, '489')
})

test('normalization never turns unknown labels into residual waste', () => {
  assert.equal(normalizeWasteType('Bio'), 'matavfall'); assert.equal(normalizeWasteType('Juletre'), 'christmas_tree'); assert.equal(normalizeWasteType('Farlig avfall'), 'hazardous'); assert.equal(normalizeWasteType('Klær og tekstil'), 'textile'); assert.equal(normalizeWasteType('Mystisk fraksjon'), 'other'); assert.notEqual(normalizeWasteType('Mystisk fraksjon'), 'restavfall')
})

test('app preview grouping can render English and Norwegian titles from normalized data', () => {
  assert.equal(wasteCollectionDisplayTitle(['matavfall', 'papir'], 'en', ['Bio', 'Papp']), 'Food waste + paper')
  assert.equal(wasteCollectionDisplayTitle(['matavfall', 'papir'], 'no', ['Bio', 'Papp']), 'Matavfall + papir')
})

test('Stavanger dynamically resolves a property UUID then parses multiple fractions on one date', async () => {
  const calls = []
  const fetcher = async url => {
    calls.push(String(url))
    if (calls.length === 1) return new Response('<form action="/finn/" method="get"><input type="search" name="q"></form><script src="/assets/waste-calendar.js"></script>')
    if (calls.length === 2) return new Response('$.get("/provider/address", { searchText: request.term }, response);', { headers: { 'Content-Type': 'application/javascript' } })
    if (calls.length === 3) return Response.json([{ label: 'Selected address', value: '/show?gnumber=16&bnumber=489&snumber=0&ids=dynamic-property-id&municipality=Stavanger' }])
    return new Response('<section data-month="2026-09"><table><tr class="waste-calendar__item"><td>08.09 - tirsdag</td><td><img alt="Matavfall"><img title="Papir"></td></tr></table></section>')
  }
  const provider = createStavangerProvider(fetcher)
  const resolved = await provider.resolveAddress({ addressId: 'kartverket-id', label: 'Selected address', municipalityNumber: '1103', municipalityName: 'Stavanger', gnr: '16', bnr: '489', snr: '0' })
  assert.equal(resolved.propertyId, 'dynamic-property-id'); assert.doesNotMatch(JSON.stringify(provider), /6fa154fe|Boganesstraen/)
  const rows = provider.normalizeCollections(await provider.fetchCollections(resolved))
  assert.deepEqual(rows.map(x => x.normalizedType).sort(), ['matavfall', 'papir']); assert.equal(calls.some(call => call.includes('/finn/')), false); assert.equal(new URL(calls[2]).searchParams.get('searchText'), 'Selected address'); assert.match(calls[3], /ids=dynamic-property-id/)
})

test('Sandnes uses the published POST contract and extracts id from the observed result link', async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (calls.length === 1) return new Response('<script src="/bundles/waste-calendar"></script>')
    if (calls.length === 2) return new Response('var u="/provider/address",d={query:e.term},o={data:d,type:"POST",url:u};$.ajax(o);', { headers: { 'Content-Type': 'application/javascript' } })
    return Response.json({ results: [{ text: 'Selected address', href: '/show?gnumber=70&bnumber=152&snumber=0&id=resolved-property&municipality=Sandnes+kommune' }] })
  }
  const resolved = await createHentavfallProvider(fetcher).resolveAddress({ addressId: 'kartverket-id', label: 'Selected address', municipalityNumber: '1108', municipalityName: 'Sandnes', gnr: '70', bnr: '152', snr: '0' })
  assert.equal(resolved.propertyId, 'resolved-property'); assert.equal(calls[2].url, 'https://www.hentavfall.no/provider/address'); assert.equal(calls[2].init.method, 'POST'); assert.equal(String(calls[2].init.body), 'query=Selected+address')
})

test('inline provider config can publish a contract without address-specific markup', async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (calls.length === 1) return new Response('<script>window.wasteCalendar = { endpoint: "/provider/lookup", method: "POST", parameter: "term" }</script>')
    return Response.json([{ label: 'Selected address', value: '/show?ids=inline-property' }])
  }
  const resolved = await createStavangerProvider(fetcher).resolveAddress({ addressId: 'kartverket-id', label: 'Selected address', municipalityNumber: '1103', municipalityName: 'Stavanger' })
  assert.equal(resolved.propertyId, 'inline-property'); assert.equal(calls[1].url, 'https://www.stavanger.kommune.no/provider/lookup'); assert.equal(String(calls[1].init.body), 'term=Selected+address')
})

test('Stavanger structured calendar derives years across December and January', () => {
  const provider = createStavangerProvider(async () => { throw new Error('unused') })
  const rows = provider.normalizeCollections({ html: `
    <section data-month="2026-12"><tr class="waste-calendar__item"><td>28.12 - mandag</td><td><img alt="Restavfall"></td></tr></section>
    <section data-month="2027-01"><tr class="waste-calendar__item"><td>04.01 - mandag</td><td><img alt="Bio"><img title="Papir"></td></tr></section>` })
  assert.deepEqual(rows.map(row => [row.date, row.normalizedType]), [['2026-12-28', 'restavfall'], ['2027-01-04', 'matavfall'], ['2027-01-04', 'papir']])
})

test('MinRenovasjon fetches fractions and calendar, maps names and deduplicates', async () => {
  const calls = []
  const fetcher = async url => { calls.push(String(url)); return Response.json(calls.length === 1 ? [{ Id: 7, Navn: 'Bio' }] : [{ FraksjonId: 7, Tommedatoer: ['2026-09-08', '2026-09-08'] }]) }
  const provider = createMinRenovasjonProvider('secret', fetcher); const address = { addressId: 'a', label: 'A', municipalityNumber: '9999', municipalityName: 'X', addressCode: '1', streetName: 'Gate', houseNumber: '2' }
  const rows = provider.normalizeCollections(await provider.fetchCollections(address))
  const first = new URL(calls[0]); const second = new URL(calls[1])
  assert.equal(first.origin, 'https://norkartrenovasjon.azurewebsites.net'); assert.match(first.searchParams.get('server'), /MinRenovasjon\.Api\/api\/fraksjoner/); assert.match(second.searchParams.get('server'), /tommekalender/); assert.match(second.searchParams.get('server'), /kommunenr=9999/); assert.equal(rows.length, 1); assert.equal(rows[0].originalLabel, 'Bio'); assert.equal(rows[0].normalizedType, 'matavfall')
})

test('MinRenovasjon malformed JSON and missing key are controlled errors', async () => {
  const address = { addressId: 'a', label: 'A', municipalityNumber: '9999', municipalityName: 'X' }
  await assert.rejects(() => createMinRenovasjonProvider('', fetch).fetchCollections(address), e => e instanceof WasteProviderError && e.code === 'configuration')
  await assert.rejects(() => createMinRenovasjonProvider('key', async () => new Response('{oops')).fetchCollections(address), e => e instanceof WasteProviderError && e.code === 'invalid_response')
})

test('MinRenovasjon classifies authentication, throttling, server and no-service responses', async () => {
  const address = { addressId: 'a', label: 'A', municipalityNumber: '9999', municipalityName: 'X' }
  for (const [status, code] of [[401, 'configuration'], [403, 'configuration'], [429, 'temporary_failure'], [500, 'temporary_failure'], [503, 'temporary_failure'], [404, 'unsupported']]) {
    const provider = createMinRenovasjonProvider('key', async () => new Response('', { status }))
    await assert.rejects(() => provider.fetchCollections(address), error => error instanceof WasteProviderError && error.code === code)
  }
})
