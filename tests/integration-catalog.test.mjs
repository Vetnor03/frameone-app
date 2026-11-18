import assert from 'node:assert/strict'
import test from 'node:test'
import { INTEGRATION_CATALOGUE, integrationMatchesSearch, integrationStatusLabel } from '../app/lib/integrations/catalog.ts'

test('shared integrations are ordered and expose lifecycle capabilities', () => {
  assert.deepEqual(INTEGRATION_CATALOGUE.map(item => item.key), ['teams', 'google-calendar', 'local-events', 'spond', 'waste', 'bonnetid', 'vigilo', 'transponder', 'planta'])
  const waste = INTEGRATION_CATALOGUE.find(item => item.key === 'waste')
  assert.deepEqual({ status: waste.status, connectable: waste.connectable }, { status: 'experimental', connectable: true })
  assert.equal(waste.description.en, 'Find your address and see upcoming waste collections')
  const prayer = INTEGRATION_CATALOGUE.find(item => item.key === 'bonnetid')
  assert.deepEqual({ status: prayer.status, connectable: prayer.connectable }, { status: 'experimental', connectable: true })
  assert.equal(prayer.name.no, 'Bønnetid')
  assert.equal(INTEGRATION_CATALOGUE.find(item => item.key === 'teams').name.en, 'Teams')
  const spond = INTEGRATION_CATALOGUE.find(item => item.key === 'spond')
  assert.deepEqual({ status: spond.status, connectable: spond.connectable }, { status: 'experimental', connectable: true })
  for (const key of ['vigilo', 'transponder', 'planta']) {
    const integration = INTEGRATION_CATALOGUE.find(item => item.key === key)
    assert.deepEqual({ status: integration.status, connectable: integration.connectable }, { status: 'under-evaluation', connectable: false })
  }
  assert.equal(integrationStatusLabel('experimental', 'en'), 'Experimental')
  assert.equal(integrationStatusLabel('under-evaluation', 'en'), 'Under evaluation')
})

test('Connect Apps search matches names, localizations and evaluation statuses', () => {
  const keys = (query) => INTEGRATION_CATALOGUE.filter(item => integrationMatchesSearch(item, query)).map(item => item.key)
  assert.deepEqual(keys(' PLanTa '), ['planta'])
  assert.deepEqual(keys('Renovasjon'), ['waste'])
  assert.deepEqual(keys('Bønnetid'), ['bonnetid'])
  assert.deepEqual(keys('calendar'), ['google-calendar'])
  assert.deepEqual(keys('under evaluation'), ['vigilo', 'transponder', 'planta'])
  assert.deepEqual(keys('under vurdering'), ['vigilo', 'transponder', 'planta'])
  assert.deepEqual(keys('not a real integration'), [])
  assert.deepEqual(keys('  '), INTEGRATION_CATALOGUE.map(item => item.key))
})
