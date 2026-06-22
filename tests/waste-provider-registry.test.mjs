import assert from 'node:assert/strict'
import { test } from 'node:test'
import { providerFor } from '../app/lib/integrations/waste/providers.ts'

test('Stavanger and Sandnes waste providers fail with setup-specific fetch error', async () => {
  const resolvedAddress = {
    addressId: '1103-123-1-',
    label: 'Madlaveien 1',
    municipalityNumber: '1103',
    municipalityName: 'Stavanger',
  }

  await assert.rejects(
    () => providerFor('stavanger').fetchCollections(resolvedAddress),
    /Provider supported but fetch not implemented yet/,
  )
  await assert.rejects(
    () => providerFor('sandnes').fetchCollections({ ...resolvedAddress, municipalityNumber: '1108', municipalityName: 'Sandnes' }),
    /Provider supported but fetch not implemented yet/,
  )
})
