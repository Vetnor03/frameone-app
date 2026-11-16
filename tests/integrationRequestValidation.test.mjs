import assert from 'node:assert/strict'
import test from 'node:test'
import { validateIntegrationRequest } from '../app/lib/integrations/requestValidation.mjs'

test('accepts and normalizes a request without a note', () => {
  assert.deepEqual(validateIntegrationRequest({ appName: '  Apple   Calendar  ' }), {
    appName: 'Apple Calendar', note: null,
  })
})

test('preserves optional explanation and trims whitespace', () => {
  assert.deepEqual(validateIntegrationRequest({ appName: 'Vigilo', note: ' School messages ' }), {
    appName: 'Vigilo', note: 'School messages',
  })
})

test('rejects malformed, blank, and oversized submissions', () => {
  for (const request of [
    null, [], {}, { appName: '' }, { appName: 'A' },
    { appName: 'a'.repeat(81) }, { appName: 'Vigilo', note: 123 },
    { appName: 'Vigilo', note: 'x'.repeat(501) },
  ]) assert.equal(validateIntegrationRequest(request), null)
})
