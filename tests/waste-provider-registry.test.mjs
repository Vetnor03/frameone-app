import test from 'node:test'
import assert from 'node:assert/strict'
import { createMinRenovasjonProvider, createStavangerProvider, normalizeWasteType, searchKartverketAddresses, WasteProviderError } from '../app/lib/integrations/waste/providers.ts'

test('Kartverket autocomplete preserves multiple complete address candidates', async () => {
  const fetcher = async () => Response.json({ adresser: [
    { adressetekst: 'Boganesstraen 36B', adressenavn: 'Boganesstraen', nummer: 36, bokstav: 'B', postnummer: '4020', poststed: 'Stavanger', kommunenummer: '1103', kommunenavn: 'Stavanger', adressekode: 1234, gardsnummer: 16, bruksnummer: 489, seksjonsnummer: 0, representasjonspunkt: { lat: 58.9, lon: 5.7 } },
    { adressetekst: 'Boganesstraen 38', nummer: 38, postnummer: '4020', poststed: 'Stavanger', kommunenummer: '1103', kommunenavn: 'Stavanger', adressekode: 1234 },
  ] })
  const rows = await searchKartverketAddresses('Boganesstraen', fetcher)
  assert.equal(rows.length, 2); assert.equal(rows[0].houseNumber, '36B'); assert.equal(rows[0].label, 'Boganesstraen 36B, 4020 Stavanger'); assert.equal(rows[0].municipalityNumber, '1103'); assert.equal(rows[0].addressCode, '1234'); assert.equal(rows[0].gnr, '16'); assert.equal(rows[0].bnr, '489')
})

test('normalization never turns unknown labels into residual waste', () => {
  assert.equal(normalizeWasteType('Bio'), 'matavfall'); assert.equal(normalizeWasteType('Juletre'), 'christmas_tree'); assert.equal(normalizeWasteType('Farlig avfall'), 'hazardous'); assert.equal(normalizeWasteType('Klær og tekstil'), 'textile'); assert.equal(normalizeWasteType('Mystisk fraksjon'), 'other'); assert.notEqual(normalizeWasteType('Mystisk fraksjon'), 'restavfall')
})

test('Stavanger dynamically resolves a property UUID then parses multiple fractions on one date', async () => {
  const calls = []
  const fetcher = async url => { calls.push(String(url)); return calls.length === 1 ? Response.json({ suggestions: [{ ids: 'dynamic-property-id', gnumber: 16, bnumber: 489, snumber: 0 }] }) : new Response('<div>08.09.2026 - tirsdag <img alt="Matavfall"><img title="Papir"></div>') }
  const provider = createStavangerProvider(fetcher)
  const resolved = await provider.resolveAddress({ addressId: 'kartverket-id', label: 'Selected address', municipalityNumber: '1103', municipalityName: 'Stavanger', gnr: '16', bnr: '489', snr: '0' })
  assert.equal(resolved.propertyId, 'dynamic-property-id'); assert.doesNotMatch(JSON.stringify(provider), /6fa154fe|Boganesstraen/)
  const rows = provider.normalizeCollections(await provider.fetchCollections(resolved))
  assert.deepEqual(rows.map(x => x.normalizedType).sort(), ['matavfall', 'papir']); assert.match(calls[1], /ids=dynamic-property-id/)
})

test('MinRenovasjon fetches fractions and calendar, maps names and deduplicates', async () => {
  const calls = []
  const fetcher = async url => { calls.push(String(url)); return Response.json(calls.length === 1 ? [{ Id: 7, Navn: 'Bio' }] : [{ FraksjonId: 7, Tommedatoer: ['2026-09-08', '2026-09-08'] }]) }
  const provider = createMinRenovasjonProvider('secret', fetcher); const address = { addressId: 'a', label: 'A', municipalityNumber: '9999', municipalityName: 'X', addressCode: '1', streetName: 'Gate', houseNumber: '2' }
  const rows = provider.normalizeCollections(await provider.fetchCollections(address))
  assert.match(calls[0], /fraksjoner/); assert.match(calls[1], /tommekalender/); assert.equal(rows.length, 1); assert.equal(rows[0].originalLabel, 'Bio'); assert.equal(rows[0].normalizedType, 'matavfall')
})

test('MinRenovasjon malformed JSON and missing key are controlled errors', async () => {
  const address = { addressId: 'a', label: 'A', municipalityNumber: '9999', municipalityName: 'X' }
  await assert.rejects(() => createMinRenovasjonProvider('', fetch).fetchCollections(address), e => e instanceof WasteProviderError && e.code === 'configuration')
  await assert.rejects(() => createMinRenovasjonProvider('key', async () => new Response('{oops')).fetchCollections(address), e => e instanceof WasteProviderError && e.code === 'invalid_response')
})
