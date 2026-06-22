import assert from 'node:assert/strict'
import { test } from 'node:test'
import { providerFor } from '../app/lib/integrations/waste/providers.ts'

test('Stavanger and Sandnes waste providers return detailed configuration errors without endpoint data', async () => {
  const resolvedAddress = {
    addressId: '1103-123-1-',
    label: 'Madlaveien 1',
    municipalityNumber: '1103',
    municipalityName: 'Stavanger',
  }

  await assert.rejects(
    () => providerFor('stavanger').fetchCollections(resolvedAddress),
    /Stavanger waste provider needs a public calendar URL or gnr\/bnr\/id in provider_config/,
  )
  await assert.rejects(
    () => providerFor('sandnes').fetchCollections({ ...resolvedAddress, municipalityNumber: '1108', municipalityName: 'Sandnes' }),
    /Sandnes waste provider needs a public calendar URL or gnr\/bnr\/id in provider_config/,
  )
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
