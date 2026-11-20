import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { HOMEY_SUPPORTED_CAPABILITIES, normalizeHomeyDevice, normalizeHomeyDevices } from '../app/lib/integrations/homey/model.mjs'
import { homeyAuthorizationUrl, homeyTokenRequest } from '../app/lib/integrations/homey/oauth.mjs'

test('Homey is evaluation-only until real connection, permission and status handling exist', () => {
  const catalogue = readFileSync(new URL('../app/lib/integrations/catalog.ts', import.meta.url), 'utf8')
  assert.match(catalogue, /key: 'homey'[^\n]*status: 'under-evaluation', connectable: false/)
})

test('Homey data projection is read-only and discards private/unsupported metadata', () => {
  const input = {
    'device-123': {
      id: 'device-123', name: 'Living room', class: 'sensor', token: 'secret',
      zone: 'private location', notes: 'private notes',
      capabilitiesObj: {
        measure_temperature: { value: 21.4, lastUpdated: 'hidden' },
        measure_humidity: { value: 44 },
        measure_co2: { value: 600 },
        measure_power: { value: 275 },
        meter_power: { value: 2.5 },
        alarm_contact: { value: false },
        onoff: { value: true },
        target_temperature: { value: 24 },
      },
    },
    empty: { name: 'Unsupported', capabilitiesObj: { dim: { value: 0.7 } } },
  }
  assert.deepEqual(normalizeHomeyDevices(input), [{
    id: 'device-123', name: 'Living room', class: 'sensor', values: {
      temperature: { value: 21.4, unit: '°C' },
      humidity: { value: 44, unit: '%' },
      co2: { value: 600, unit: 'ppm' },
      power: { value: 275, unit: 'W' },
      energy: { value: 2.5, unit: 'kWh' },
      on: true, contact_alarm: false,
    },
  }])
  const serialized = JSON.stringify(normalizeHomeyDevices(input))
  for (const privateValue of ['secret', 'private location', 'private notes', 'lastUpdated', 'target_temperature']) {
    assert.equal(serialized.includes(privateValue), false)
  }
})

test('Homey measurements reject bad values and preserve true boolean status', () => {
  assert.equal(normalizeHomeyDevice({id: 'a', capabilitiesObj: {
    measure_temperature: {value: NaN}, measure_humidity: {value: 999},
    measure_co2: {value: '450'}, alarm_contact: {value: 'false'},
  }}), null)
  assert.deepEqual(normalizeHomeyDevice({id:'a',capabilitiesObj:{onoff:{value:false}}}).values, {on: false})
  assert.deepEqual(normalizeHomeyDevices(null), [])
  assert.deepEqual(HOMEY_SUPPORTED_CAPABILITIES, [
    'measure_temperature', 'measure_humidity', 'measure_co2', 'measure_power', 'meter_power', 'onoff', 'alarm_contact',
  ])
})

test('Homey OAuth authorization uses official non-standard parameter and state', () => {
  const url = new URL(homeyAuthorizationUrl({clientId:'client',redirectUri:'https://re-mind.no/api/integrations/homey/callback',state:'nonce'}))
  assert.equal(url.origin, 'https://api.athom.com')
  assert.equal(url.pathname, '/oauth2/authorise')
  assert.equal(url.searchParams.get('authorization_type'), 'code')
  assert.equal(url.searchParams.get('state'), 'nonce')
  assert.equal(url.searchParams.get('client_id'), 'client')
  assert.throws(() => homeyAuthorizationUrl({clientId:'id',redirectUri:'http://attacker.com/callback',state:'state'}))
  assert.throws(() => homeyAuthorizationUrl({clientId:'id',redirectUri:'https://app.example/callback',state:''}))
})

test('Homey OAuth exchange and refresh use POST, Basic auth and form body', () => {
  const common = {clientId:'id',clientSecret:'secret'}
  const exchange = homeyTokenRequest({...common,code:'sample-code'})
  assert.equal(exchange.url, 'https://api.athom.com/oauth2/token')
  assert.equal(exchange.method, 'POST')
  assert.equal(exchange.headers.Authorization, 'Basic aWQ6c2VjcmV0')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(exchange.body)), {
    grant_type:'authorization_code',authorization_code:'sample-code',
  })
  assert.deepEqual(Object.fromEntries(new URLSearchParams(homeyTokenRequest({...common,refreshToken:'new-refresh'}).body)), {
    grant_type:'refresh_token',refresh_token:'new-refresh',
  })
  assert.throws(() => homeyTokenRequest({...common,code:'x',refreshToken:'y'}))
  assert.throws(() => homeyTokenRequest({...common}))
})
