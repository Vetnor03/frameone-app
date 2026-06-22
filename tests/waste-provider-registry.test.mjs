import assert from 'node:assert/strict'
import { test } from 'node:test'
import { providerFor } from '../app/lib/integrations/waste/providers.ts'

test('Stavanger and Sandnes waste providers require provider UUIDs', async () => {
  const resolvedAddress = {
    addressId: '1103-123-1-',
    label: 'Madlaveien 1',
    municipalityNumber: '1103',
    municipalityName: 'Stavanger',
  }

  await assert.rejects(
    () => providerFor('stavanger').fetchCollections(resolvedAddress),
    /Stavanger waste provider could not resolve provider UUID/,
  )
  await assert.rejects(
    () => providerFor('sandnes').fetchCollections({ ...resolvedAddress, municipalityNumber: '1108', municipalityName: 'Sandnes' }),
    /Sandnes waste provider could not resolve provider UUID/,
  )
})

test('Kartverket numeric property fields are preserved for waste provider lookup', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    adresser: [{
      adressetekst: 'Boganesstraen 36B',
      kommunenummer: '1103',
      kommunenavn: 'Stavanger',
      adressekode: 1234,
      nummer: 36,
      bokstav: 'B',
      gardsnummer: 17,
      bruksnummer: 235,
      festenummer: 0,
      seksjonsnummer: 0,
      adressenavn: 'Boganesstraen',
      postnummer: '4020',
      representasjonspunkt: { lat: 58.9, lon: 5.7 },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })

  try {
    const resolved = await providerFor('stavanger').resolveAddress('Boganesstraen 36B')
    assert.equal(resolved.addressId, '1103-1234-36-B')
    assert.equal(resolved.houseNumber, '36B')
    assert.equal(resolved.gnr, '17')
    assert.equal(resolved.bnr, '235')
    assert.equal(resolved.fnr, '0')
    assert.equal(resolved.snr, '0')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Stavanger provider normalizes configured public calendar rows', () => {
  const rows = providerFor('stavanger').normalizeCollections({
    collections: [
      { date: '2026-11-17', fractions: ['Mat', 'Hage', 'Restavfall'], source_url: 'https://www.stavanger.kommune.no/example' },
      { date: '2026-11-24', fractions: ['Restavfall'], source_url: 'https://www.stavanger.kommune.no/example' },
    ],
  })

  assert.deepEqual(rows.map((row) => [row.date, row.waste_fraction, row.title]), [
    ['2026-11-17', 'hageavfall', 'Tøm hageavfall'],
    ['2026-11-17', 'matavfall', 'Tøm matavfall'],
    ['2026-11-17', 'restavfall', 'Tøm restavfall'],
    ['2026-11-24', 'restavfall', 'Tøm restavfall'],
  ])
})

test('Norconsult providers build public calendar URLs with provider-specific UUID parameter names', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return new Response(`23.06 - tirsdag\nImage: Restavfall\n30.06 - tirsdag\nImage: Mat`, { status: 200, headers: { 'content-type': 'text/html' } })
  }

  try {
    await providerFor('stavanger').fetchCollections({
      addressId: '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b',
      propertyId: '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b',
      label: 'Boganesstraen 36B',
      municipalityNumber: '1103',
      municipalityName: 'Stavanger',
      gnr: '16',
      bnr: '489',
      snr: '0',
    })
    await providerFor('hentavfall').fetchCollections({
      addressId: '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7',
      propertyId: '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7',
      label: 'Professor Dahls gate 17c',
      municipalityNumber: '1108',
      municipalityName: 'Sandnes',
      gnr: '70',
      bnr: '152',
      snr: '0',
    })
    assert.match(calls[0], /ids=6fa154fe-bbaa-42d6-9a24-a2e310ecd16b/)
    assert.doesNotMatch(calls[0], /[?&]id=6fa/)
    assert.match(calls[1], /[?&]id=6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7/)
    assert.match(calls[0], /gnumber=16/)
    assert.match(calls[1], /bnumber=152/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Norconsult address resolution merges Kartverket matrikkel with provider UUID lookup results', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const textUrl = String(url)
    if (textUrl.startsWith('https://ws.geonorge.no/adresser/v1/sok')) {
      return new Response(JSON.stringify({
        adresser: [{
          adressetekst: 'Professor Dahls gate 17C',
          kommunenummer: '1108',
          kommunenavn: 'Sandnes',
          adressekode: 23400,
          nummer: 17,
          bokstav: 'C',
          gardsnummer: 70,
          bruksnummer: 152,
          seksjonsnummer: 0,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      results: [{
        id: '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7',
        address: 'Professor Dahls gate 17C',
        gnumber: 70,
        bnumber: 152,
        snumber: 0,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    const resolved = await providerFor('hentavfall').resolveAddress('Professor Dahls gate 17c')
    assert.equal(resolved.addressId, '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7')
    assert.equal(resolved.propertyId, '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7')
    assert.equal(resolved.municipalityNumber, '1108')
    assert.equal(resolved.gnr, '70')
    assert.equal(resolved.bnr, '152')
    assert.equal(resolved.snr, '0')
  } finally {
    globalThis.fetch = originalFetch
  }
})
