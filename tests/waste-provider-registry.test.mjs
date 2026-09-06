import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHimProvider, createMinRenovasjonProvider, createOsloProvider, createRenovasjonsportalProvider, normalizeOsloCollections, normalizeWasteType, providerForAddress, providerRegistrationFor, searchKartverketAddresses, WasteProviderError } from '../app/lib/integrations/waste/providers.ts'
import { norwayLocalYmd } from '../app/lib/integrations/waste/date.ts'
import { wasteCachePlan } from '../app/lib/integrations/waste/cache.ts'
import { wasteCollectionDisplayTitle } from '../app/lib/integrations/waste/display.ts'

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
  const resolved = await provider.resolveAddress(address()), rows = provider.normalizeCollections(await provider.fetchCollections(resolved))
  assert.deepEqual(rows.map(row => [row.date, row.rawType, row.semanticSource]), [['2026-09-08', 'matavfall', 'css_identifier'], ['2026-09-08', 'mysterieavfall', 'css_identifier'], ['2026-09-08', 'papir', 'css_identifier']])
  assert.equal(rows.find(row => row.rawType === 'mysterieavfall').normalizedType, 'other')
  assert.doesNotMatch(rows[0].raw, /2026|08\.09/)
  assert.throws(() => provider.normalizeCollections({ html: '<html>broken</html>' }), error => error.code === 'invalid_response')
})

test('HIM deterministically follows an exact provider suggestion for spaced house letters', async () => {
  const calls = [], provider = createHimProvider(async url => { calls.push(new URL(url).searchParams.get('adressesok')); return new Response(await fixture(calls.length === 1 ? 'him-suggestions.html' : 'him.html')) })
  const selected = { ...address(), addressId: 'him-77e', label: 'Haugevegen 77E, 5515 Haugesund', streetName: 'Haugevegen', houseNumber: '77', houseLetter: 'E' }
  const resolved = await provider.resolveAddress(selected)
  assert.equal(resolved.label, selected.label); assert.equal(resolved.propertyId, 'Haugevegen 77 E')
  const rows = provider.normalizeCollections(await provider.fetchCollections(resolved))
  assert.deepEqual(calls, ['Haugevegen 77 E', 'Haugevegen 77 E']); assert.equal(rows[0].date, '2026-09-08')
})

test('HIM ambiguous normalized suggestions are unsupported and never select the first result', async () => {
  const calls = [], provider = createHimProvider(async url => { calls.push(String(url)); return new Response(await fixture('him-suggestions-ambiguous.html')) })
  const selected = { ...address(), label: 'Haugevegen 77E, 5515 Haugesund', streetName: 'Haugevegen', houseNumber: '77', houseLetter: 'E' }
  await assert.rejects(() => provider.resolveAddress(selected), error => error instanceof WasteProviderError && error.code === 'unsupported')
  assert.equal(calls.length, 1)
})

test('Oslo fixture preserves JSON labels, IDs, same-day fractions, and unknowns', async () => {
  const provider = createOsloProvider(async url => { const query = new URL(url); assert.deepEqual([...query.searchParams.keys()].sort(), ['letter', 'number', 'street', 'street_id']); assert.equal(query.searchParams.get('number'), '2'); assert.equal(query.searchParams.get('letter'), 'B'); assert.equal(query.searchParams.get('street_id'), '1'); assert.equal(query.searchParams.has('houseNumber'), false); assert.equal(query.searchParams.has('houseLetter'), false); return new Response(await fixture('oslo.json'), { headers: { 'content-type': 'application/json' } }) })
  const raw = await provider.fetchCollections({ ...address('0301'), houseLetter: 'B' }), rows = normalizeOsloCollections(raw, '2026-09-01')
  const firstDay = rows.filter(row => row.date === '2026-09-08')
  assert.deepEqual(firstDay.map(row => [row.date, row.rawType, row.semanticSource]), [['2026-09-08', 'Matavfall', 'json_field'], ['2026-09-08', 'Ukjent prøve', 'json_field']])
  assert.equal(firstDay[1].normalizedType, 'other'); assert.equal(firstDay[1].providerEventId, 'event-2:2026-09-08')
  assert.equal(rows.length, 2, 'a provider-supplied future date is emitted once per service')
  assert.throws(() => provider.normalizeCollections({ nope: [] }), error => error.code === 'invalid_response')
})

test('Oslo past dates produce exactly eight occurrences using pinned factor day intervals', () => {
  for (const [factor, interval] of [[10000, 7], [20000, 4], [30000, 3], [40000, 14], [50000, 28], [99999, 7]]) {
    const rows = normalizeOsloCollections({ result: [{ HentePunkts: [{ Tjenester: [{ Id: `event-${factor}`, Fraksjon: { Id: 'fraction', Tekst: 'Restavfall' }, TommeDato: '01.08.2026', Hyppighet: { Faktor: factor } }] }] }] }, '2026-09-01')
    assert.equal(rows.length, 8)
    const first = new Date(`${rows[0].date}T12:00:00Z`), second = new Date(`${rows[1].date}T12:00:00Z`)
    assert.ok(rows[0].date >= '2026-09-01')
    assert.equal((second.getTime() - first.getTime()) / 86_400_000, interval)
  }
})

test('MinRenovasjon fixture joins fraction identity to labels and preserves unknown fractions', async () => {
  const responses = [JSON.parse(await fixture('minrenovasjon-fractions.json')), JSON.parse(await fixture('minrenovasjon-calendar.json'))]
  const calls = [], provider = createMinRenovasjonProvider('server-secret', async (url, options) => { calls.push({ url: new URL(url), options }); return Response.json(responses.shift()) })
  const rows = provider.normalizeCollections(await provider.fetchCollections(address('3205')))
  assert.deepEqual(rows.map(row => [row.date, row.rawType, row.semanticSource]), [['2026-09-08', 'Matavfall', 'fraction_id'], ['2026-09-08', 'Ukjent prøve', 'fraction_id']])
  assert.equal(rows[1].normalizedType, 'other'); assert.equal(rows[1].providerTypeId, '99')
  assert.equal(calls[0].url.origin, 'https://norkartrenovasjon.azurewebsites.net'); const fractionsUrl = new URL(calls[0].url.searchParams.get('server')); const calendarUrl = new URL(calls[1].url.searchParams.get('server'))
  assert.equal(fractionsUrl.origin, 'https://komteksky.norkart.no'); assert.equal([...fractionsUrl.searchParams].length, 0); assert.equal(fractionsUrl.searchParams.has('gatekode'), false)
  assert.deepEqual([...calendarUrl.searchParams.keys()].sort(), ['gatekode', 'gatenavn', 'husnr']); assert.equal(calendarUrl.searchParams.get('gatekode'), '1'); assert.equal(calls[1].options.headers.Kommunenr, '3205'); assert.equal(calls[1].options.headers.RenovasjonAppKey, 'server-secret')
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

test('ReMidt formats the real Follovegen house letter as a separate provider token', async () => {
  const calls = [], provider = createRenovasjonsportalProvider('https://kalender.renovasjonsportal.no/api', async url => { calls.push(String(url)); return calls.length === 1 ? Response.json({ searchResults: [{ id: 'other', title: 'Follovegen 2' }, { id: 'remidt-1b', title: 'Follovegen 1 B' }] }) : Response.json(JSON.parse(await fixture('renovasjonsportal-details.json'))) })
  const selected = { ...address('5059'), label: 'Follovegen 1B, 7300 Orkanger', streetName: 'Follovegen', houseNumber: '1', houseLetter: 'B' }
  const resolved = await provider.resolveAddress(selected); await provider.fetchCollections(resolved)
  assert.equal(resolved.label, selected.label); assert.equal(resolved.propertyId, 'remidt-1b')
  assert.equal(calls[0], 'https://kalender.renovasjonsportal.no/api/address/Follovegen%201%20B')
  assert.equal(calls[1], 'https://kalender.renovasjonsportal.no/api/address/remidt-1b/details')
})

test('registry config uses the pinned Fosen and ReMidt Renovasjonsportal API origins', () => {
  assert.equal(providerForAddress(address('5054')).family, 'renovasjonsportal')
  assert.equal(providerRegistrationFor('5054').baseUrl, 'https://fosen.renovasjonsportal.no/api')
  assert.equal(providerRegistrationFor('5055').baseUrl, 'https://kalender.renovasjonsportal.no/api')
})

test('registry assigns Steinkjer to MinRenovasjon and never assigns Osen to Fosen', () => {
  assert.equal(providerRegistrationFor('5006').family, 'minrenovasjon')
  assert.notEqual(providerRegistrationFor('5006').brand, 'ReMidt')
  assert.equal(providerRegistrationFor('5020'), undefined)
  assert.throws(() => providerForAddress(address('5020')), error => error instanceof WasteProviderError && error.code === 'unsupported')
  assert.deepEqual(['5054', '5057', '5058'].map(number => providerRegistrationFor(number)?.brand), ['Fosen Renovasjon', 'Fosen Renovasjon', 'Fosen Renovasjon'])
})

test('failed refresh keeps the old cache plan untouched', () => assert.deepEqual(wasteCachePlan(['old-event'], [], false), { upsertIds: [], staleIds: [] }))

test('evidence-backed provider aliases normalize exactly without losing compound semantics', () => {
  const cases = {
    restavfall: ['Rest', 'Restavfall', 'Restavfall til forbrenning', 'restavfall'],
    matavfall: ['Mat', 'Matavfall', 'Bio', 'matavfall'],
    papir: ['Papir', 'Papp', 'Papp og papir', 'Papp/papir', 'papir'],
    plast: ['Plast', 'Plastemballasje', 'plastemballasje'],
    glass_metall: ['Glass', 'Metall', 'Glass og metall', 'Glass og metallemballasje', 'glassemballasje', 'metallemballasje'],
    hageavfall: ['Hage', 'Hageavfall'], christmas_tree: ['Juletre'], hazardous: ['Farlig avfall'], textile: ['Tekstil', 'Klær'],
  }
  for (const [expected, labels] of Object.entries(cases)) for (const label of labels) assert.equal(normalizeWasteType(label), expected, label)
  for (const label of ['Papir og plastemballasje', 'Mystisk fraksjon', 'Plast og matavfall']) assert.equal(normalizeWasteType(label), 'other', label)
})

test('compound Fosen semantics survive as other and use the localized raw-label display fallback', () => {
  assert.equal(wasteCollectionDisplayTitle('other', 'no', 'Papir og plastemballasje'), 'Papir og plastemballasje')
  assert.equal(wasteCollectionDisplayTitle('other', 'en', 'Papir og plastemballasje'), 'Paper and plastic packaging')
  assert.equal(wasteCollectionDisplayTitle('other', 'en', 'Mystisk fraksjon'), 'Mystisk fraksjon')
  assert.equal(wasteCollectionDisplayTitle('other', 'en'), 'Other waste')
})

test('registry migration removes legacy Stavanger/Sandnes rows before validating the new provider check', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260906120000_authoritative_waste_provider_families.sql', import.meta.url), 'utf8')
  assert.ok(migration.indexOf('delete from public.waste_provider_registry') < migration.indexOf('add constraint waste_provider_registry_provider_valid'))
  assert.match(migration, /'1103', 'Stavanger', 'norconsult_unresolved'.*'preview'/)
  assert.match(migration, /'1108', 'Sandnes', 'norconsult_unresolved'.*'preview'/)
  assert.match(migration, /'5006', 'Steinkjer', 'minrenovasjon'/)
  assert.doesNotMatch(migration, /'5020', 'Osen'/)
})
