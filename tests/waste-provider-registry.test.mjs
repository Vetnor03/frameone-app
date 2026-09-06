import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHimProvider, createMinRenovasjonProvider, createOsloProvider, createRenovasjonsportalProvider, normalizeWasteType, providerForAddress, providerRegistrationFor, searchKartverketAddresses, WasteProviderError } from '../app/lib/integrations/waste/providers.ts'
import { norwayLocalYmd } from '../app/lib/integrations/waste/date.ts'
import { wasteCachePlan } from '../app/lib/integrations/waste/cache.ts'

const fixture = name => readFile(new URL(`fixtures/waste/${name}`, import.meta.url), 'utf8')
const address = (municipalityNumber = '1106') => ({ addressId: `${municipalityNumber}-1-2-`, label: 'Testveien 2, 0001 Test', municipalityNumber, municipalityName: 'Test', addressCode: '1', streetName: 'Testveien', houseNumber: '2' })

test('Norwegian canonical date uses the Norway timezone', () => assert.equal(norwayLocalYmd(new Date('2026-01-15T23:30:00Z')), '2026-01-16'))

test('Kartverket retains provider routing fields', async () => {
  const rows = await searchKartverketAddresses('Test', async () => Response.json({ adresser: [{ adressetekst: 'Testveien 2B', adressenavn: 'Testveien', nummer: 2, bokstav: 'B', postnummer: '0001', poststed: 'Oslo', kommunenummer: '0301', kommunenavn: 'Oslo', adressekode: 123 }] }))
  assert.deepEqual([rows[0].municipalityNumber, rows[0].addressCode, rows[0].houseNumber, rows[0].houseLetter], ['0301', '123', '2', 'B'])
})

test('registry is authoritative: unknown does not silently become MinRenovasjon', () => {
  assert.equal(providerRegistrationFor('9999'), undefined)
  assert.throws(() => providerForAddress(address('9999')), error => error instanceof WasteProviderError && error.code === 'unsupported')
})

test('Haugesund routes to HIM, while Stavanger and Sandnes remain unresolved preview', async () => {
  assert.equal(providerForAddress(address('1106')).family, 'him')
  assert.notEqual(providerForAddress(address('1106')).family, 'minrenovasjon')
  for (const municipality of ['1103', '1108']) await assert.rejects(() => providerForAddress(address(municipality)).resolveAddress(address(municipality)), error => error instanceof WasteProviderError && error.code === 'unsupported')
})

test('HIM fixture preserves dates, CSS semantics, same-day fractions, and unknowns', async () => {
  const provider = createHimProvider(async url => { assert.equal(new URL(url).searchParams.get('adressesok'), 'Testveien 2'); return new Response(await fixture('him.html')) })
  const rows = provider.normalizeCollections(await provider.fetchCollections(address()))
  assert.deepEqual(rows.map(row => [row.date, row.rawType, row.semanticSource]), [['2026-09-08', 'matavfall', 'css_identifier'], ['2026-09-08', 'mysterieavfall', 'css_identifier'], ['2026-09-08', 'papir', 'css_identifier']])
  assert.equal(rows.find(row => row.rawType === 'mysterieavfall').normalizedType, 'other')
  assert.doesNotMatch(rows[0].raw, /2026|08\.09/)
  assert.throws(() => provider.normalizeCollections({ html: '<html>broken</html>' }), error => error.code === 'invalid_response')
})

test('Oslo fixture preserves JSON labels, IDs, same-day fractions, and unknowns', async () => {
  const provider = createOsloProvider(async url => { const query = new URL(url); assert.deepEqual([...query.searchParams.keys()].sort(), ['letter', 'number', 'street', 'street_id']); assert.equal(query.searchParams.get('number'), '2'); assert.equal(query.searchParams.get('letter'), 'B'); assert.equal(query.searchParams.get('street_id'), '1'); assert.equal(query.searchParams.has('houseNumber'), false); assert.equal(query.searchParams.has('houseLetter'), false); return new Response(await fixture('oslo.json'), { headers: { 'content-type': 'application/json' } }) })
  const rows = provider.normalizeCollections(await provider.fetchCollections({ ...address('0301'), houseLetter: 'B' }))
  const firstDay = rows.filter(row => row.date === '2026-09-08')
  assert.deepEqual(firstDay.map(row => [row.date, row.rawType, row.semanticSource]), [['2026-09-08', 'Matavfall', 'json_field'], ['2026-09-08', 'Ukjent prøve', 'json_field']])
  assert.equal(firstDay[1].normalizedType, 'other'); assert.equal(firstDay[1].providerEventId, 'event-2:2026-09-08')
  assert.throws(() => provider.normalizeCollections({ nope: [] }), error => error.code === 'invalid_response')
})

test('MinRenovasjon fixture joins fraction identity to labels and preserves unknown fractions', async () => {
  const responses = [JSON.parse(await fixture('minrenovasjon-fractions.json')), JSON.parse(await fixture('minrenovasjon-calendar.json'))]
  const calls = [], provider = createMinRenovasjonProvider('server-secret', async (url, options) => { calls.push({ url: new URL(url), options }); return Response.json(responses.shift()) })
  const rows = provider.normalizeCollections(await provider.fetchCollections(address('3205')))
  assert.deepEqual(rows.map(row => [row.date, row.rawType, row.semanticSource]), [['2026-09-08', 'Matavfall', 'fraction_id'], ['2026-09-08', 'Ukjent prøve', 'fraction_id']])
  assert.equal(rows[1].normalizedType, 'other'); assert.equal(rows[1].providerTypeId, '99')
  assert.equal(calls[0].url.origin, 'https://komteksky.norkart.no'); assert.equal(calls[0].url.searchParams.get('kommunenr'), '3205'); assert.equal(calls[0].url.searchParams.has('gatekode'), false)
  assert.equal(calls[1].url.searchParams.get('gatekode'), '1'); assert.equal(calls[1].options.headers.Kommunenr, '3205'); assert.equal(calls[1].options.headers.RenovasjonAppKey, 'server-secret')
  assert.throws(() => provider.normalizeCollections({ fractions: {}, calendar: [] }), error => error.code === 'invalid_response')
  await assert.rejects(() => createMinRenovasjonProvider('').fetchCollections(address('3205')), error => error.code === 'configuration' && /server-only/.test(error.message))
})

test('Renovasjonsportal fixture uses address paths, deterministic matching, and preserves raw fractions', async () => {
  const calls = [], provider = createRenovasjonsportalProvider('https://fosen.renovasjonsportal.no/api', async url => { calls.push(String(url)); return calls.length === 1 ? Response.json(JSON.parse(await fixture('renovasjonsportal-search.json'))) : Response.json(JSON.parse(await fixture('renovasjonsportal-details.json'))) })
  const resolved = await provider.resolveAddress(address('5054')), rows = provider.normalizeCollections(await provider.fetchCollections(resolved))
  assert.equal(resolved.propertyId, 'stable-address-7'); assert.equal(calls[0], 'https://fosen.renovasjonsportal.no/api/address/Testveien%202'); assert.equal(calls[1], 'https://fosen.renovasjonsportal.no/api/address/stable-address-7/details')
  assert.deepEqual(rows.map(row => [row.date, row.rawType, row.semanticSource]), [['2026-09-08', 'Restavfall', 'json_field'], ['2026-09-08', 'Ukjent portalfraksjon', 'json_field']])
  assert.equal(rows[1].normalizedType, 'other')
  assert.throws(() => provider.normalizeCollections({ disposals: 'bad' }), error => error.code === 'invalid_response')
})

test('registry config uses the pinned Fosen and ReMidt Renovasjonsportal API origins', () => {
  assert.equal(providerForAddress(address('5054')).family, 'renovasjonsportal')
  assert.equal(providerRegistrationFor('5054').baseUrl, 'https://fosen.renovasjonsportal.no/api')
  assert.equal(providerRegistrationFor('5006').baseUrl, 'https://kalender.renovasjonsportal.no/api')
})

test('failed refresh keeps the old cache plan untouched', () => assert.deepEqual(wasteCachePlan(['old-event'], [], false), { upsertIds: [], staleIds: [] }))

test('normalization does not coerce unknown semantics', () => assert.equal(normalizeWasteType('Mystisk fraksjon'), 'other'))
