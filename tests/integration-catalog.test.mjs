import assert from 'node:assert/strict'
import test from 'node:test'
import { INTEGRATION_CATALOGUE, integrationStatusLabel } from '../app/lib/integrations/catalog.ts'

test('shared integrations are ordered and expose lifecycle capabilities', () => {
  assert.equal(INTEGRATION_CATALOGUE[0].key, 'waste')
  const spond = INTEGRATION_CATALOGUE.find(item => item.key === 'spond')
  assert.deepEqual({ status: spond.status, connectable: spond.connectable }, { status: 'experimental', connectable: true })
  for (const key of ['vigilo', 'transponder']) {
    const integration = INTEGRATION_CATALOGUE.find(item => item.key === key)
    assert.deepEqual({ status: integration.status, connectable: integration.connectable }, { status: 'under-evaluation', connectable: false })
  }
  assert.equal(integrationStatusLabel('experimental', 'en'), 'Experimental')
  assert.equal(integrationStatusLabel('under-evaluation', 'en'), 'Under evaluation')
})
