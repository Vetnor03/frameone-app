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

test('Norconsult providers temporarily fall back to known test-address UUIDs', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return new Response(`23.06 - tirsdag\nImage: Restavfall`, { status: 200, headers: { 'content-type': 'text/html' } })
  }

  try {
    await providerFor('stavanger').fetchCollections({
      addressId: '1103-1234-36-B',
      label: 'Boganesstraen 36B',
      municipalityNumber: '1103',
      municipalityName: 'Stavanger',
      gnr: '16',
      bnr: '489',
      snr: '0',
    })
    await providerFor('hentavfall').fetchCollections({
      addressId: '1108-23400-17-C',
      label: 'Professor Dahls gate 17C',
      municipalityNumber: '1108',
      municipalityName: 'Sandnes',
      gnr: '70',
      bnr: '152',
      snr: '0',
    })
    assert.match(calls[0], /ids=6fa154fe-bbaa-42d6-9a24-a2e310ecd16b/)
    assert.match(calls[1], /[?&]id=6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Norconsult address resolution extracts Stavanger ids UUID from provider address search', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const textUrl = String(url)
    if (textUrl.startsWith('https://ws.geonorge.no/adresser/v1/sok')) {
      return new Response(JSON.stringify({
        adresser: [{
          adressetekst: 'Boganesstraen 36B',
          kommunenummer: '1103',
          kommunenavn: 'Stavanger',
          adressekode: 1234,
          nummer: 36,
          bokstav: 'B',
          gardsnummer: 16,
          bruksnummer: 489,
          seksjonsnummer: 0,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      suggestions: [{
        ids: '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b',
        address: 'Boganesstraen 36B',
        gnumber: 16,
        bnumber: 489,
        snumber: 0,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    const resolved = await providerFor('stavanger').resolveAddress('Boganesstraen 36B')
    assert.equal(resolved.addressId, '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b')
    assert.equal(resolved.propertyId, '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b')
    assert.equal(resolved.gnr, '16')
    assert.equal(resolved.bnr, '489')
    assert.equal(resolved.snr, '0')
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

test('Norconsult calendar parser maps row icons through the legend and supports multiple fractions per date', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(`
    <table>
      <thead><tr><th>Dato og dag</th><th>Avfallstype</th></tr></thead>
      <tbody>
        <tr><td>23.06 - tirsdag</td><td><img class="bin apple green" src="/icons/apple-core.svg"></td><td><svg class="garden"><use href="#hage-icon"></use></svg></td></tr>
        <tr><td>30.06 - tirsdag</td><td><img src="/icons/plast-purple.svg" alt=""><img src="/icons/rest-black.svg"></td></tr>
      </tbody>
    </table>
    <section aria-label="Forklaring">
      <div><img src="/icons/apple-core.svg" alt="">Matavfall</div>
      <div><svg><use href="#hage-icon"></use></svg>Hageavfall</div>
      <div><img src="/icons/plast-purple.svg" title="plast">Plastemballasje</div>
      <div><img src="/icons/rest-black.svg" aria-label="sort sekk">Restavfall</div>
    </section>
  `, { status: 200, headers: { 'content-type': 'text/html' } })

  try {
    const raw = await providerFor('stavanger').fetchCollections({
      addressId: '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b',
      propertyId: '6fa154fe-bbaa-42d6-9a24-a2e310ecd16b',
      label: 'Boganesstraen 36B',
      municipalityNumber: '1103',
      municipalityName: 'Stavanger',
      gnr: '16',
      bnr: '489',
      snr: '0',
    })
    const rows = providerFor('stavanger').normalizeCollections(raw)
    assert.deepEqual(rows.map((row) => ({ date: row.date, title: row.title })), [
      { date: '2026-06-23', title: 'Tøm hageavfall' },
      { date: '2026-06-23', title: 'Tøm matavfall' },
      { date: '2026-06-30', title: 'Tøm plast' },
      { date: '2026-06-30', title: 'Tøm restavfall' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Norconsult calendar parser uses accessible icon attributes when legend entries are implicit', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(`
    <table><tr><th>Dato og dag</th><th>Avfallstype</th></tr>
      <tr><td>25.06 - torsdag</td><td><img src="/apple.svg" alt="Green apple-core icon"></td></tr>
    </table>
    <div><img src="/apple.svg" alt="Green apple-core icon">Matavfall</div>
  `, { status: 200, headers: { 'content-type': 'text/html' } })

  try {
    const raw = await providerFor('hentavfall').fetchCollections({
      addressId: '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7',
      propertyId: '6ddae2f0-9f6a-4e17-90dc-ba5a01e18ed7',
      label: 'Professor Dahls gate 17C',
      municipalityNumber: '1108',
      municipalityName: 'Sandnes',
      gnr: '70',
      bnr: '152',
      snr: '0',
    })
    const rows = providerFor('hentavfall').normalizeCollections(raw)
    assert.deepEqual(rows.map((row) => ({ date: row.date, title: row.title })), [
      { date: '2026-06-25', title: 'Tøm matavfall' },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
