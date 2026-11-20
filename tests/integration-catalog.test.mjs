import assert from 'node:assert/strict'
import test from 'node:test'
import { INTEGRATION_CATALOGUE, integrationMatchesSearch, integrationStatusLabel, sortConnectedAppsFirst } from '../app/lib/integrations/catalog.ts'

test('shared integrations are ordered and expose lifecycle capabilities', () => {
  assert.deepEqual(INTEGRATION_CATALOGUE.map(item => item.key), ['teams', 'google-calendar', 'bonnetid', 'local-events', 'spond', 'waste', 'todoist', 'vigilo', 'transponder', 'planta'])
  const waste = INTEGRATION_CATALOGUE.find(item => item.key === 'waste')
  assert.deepEqual({ status: waste.status, connectable: waste.connectable }, { status: 'experimental', connectable: true })
  assert.equal(waste.description.en, 'Find your address and see upcoming waste collections')
  assert.equal(INTEGRATION_CATALOGUE.find(item => item.key === 'teams').name.en, 'Teams')
  const todoist = INTEGRATION_CATALOGUE.find(item => item.key === 'todoist')
  assert.deepEqual({ status: todoist.status, connectable: todoist.connectable }, { status: 'experimental', connectable: true })
  const spond = INTEGRATION_CATALOGUE.find(item => item.key === 'spond')
  assert.deepEqual({ status: spond.status, connectable: spond.connectable }, { status: 'experimental', connectable: true })
  assert.deepEqual(INTEGRATION_CATALOGUE.find(item => item.key === 'bonnetid') && (({ status, connectable }) => ({ status, connectable }))(INTEGRATION_CATALOGUE.find(item => item.key === 'bonnetid')), { status: 'available', connectable: true })
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
  assert.deepEqual(keys('calendar'), ['google-calendar', 'bonnetid'])
  assert.deepEqual(keys('under evaluation'), ['vigilo', 'transponder', 'planta'])
  assert.deepEqual(keys('under vurdering'), ['vigilo', 'transponder', 'planta'])
  assert.deepEqual(keys('not a real integration'), [])
  assert.deepEqual(keys('  '), INTEGRATION_CATALOGUE.map(item => item.key))
})


test('Connect Apps puts connected apps first, alphabetically within each status', () => {
  const connected = new Set(['google-calendar', 'spond', 'waste'])
  const apps = INTEGRATION_CATALOGUE.map(definition => ({
    app: { ...definition, name: definition.name.en },
    connected: connected.has(definition.key),
  }))
  const keys = (items) => items.map(item => item.app.key)

  assert.deepEqual(keys(sortConnectedAppsFirst(apps)), [
    'google-calendar', 'spond', 'waste', // connected (alphabetical, regardless of status)
    'bonnetid', 'local-events', 'teams', // available
    'todoist', // experimental
    'planta', 'transponder', 'vigilo', // under evaluation
  ])
  assert.deepEqual(keys(apps), INTEGRATION_CATALOGUE.map(item => item.key), 'does not mutate the catalogue order')

  // Disconnecting returns the app to its alphabetical position within its status group.
  const afterDisconnect = apps.map(item => item.app.key === 'google-calendar' ? { ...item, connected: false } : item)
  assert.deepEqual(keys(sortConnectedAppsFirst(afterDisconnect)), [
    'spond', 'waste',
    'google-calendar', 'bonnetid', 'local-events', 'teams',
    'planta', 'transponder', 'vigilo',
  ])
})

test('Unconnected apps sort alphabetically with Done, Experimental and Under Evaluation groups', () => {
  const apps = INTEGRATION_CATALOGUE.map(definition => ({
    app: { ...definition, name: definition.name.no },
    connected: false,
  }))
  assert.deepEqual(sortConnectedAppsFirst(apps).map(item => item.app.key), [
    'google-calendar', 'bonnetid', 'local-events', 'teams', // available / Done
    'waste', 'spond', 'todoist', // experimental: Renovasjon before Spond
    'planta', 'transponder', 'vigilo', // under evaluation
  ])
})
