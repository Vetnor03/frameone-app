import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/api/device/mirror-snapshot/base.ts', import.meta.url), 'utf8')
const start = source.indexOf('async function resolveMirrorDeviceScope')
const end = source.indexOf('\n}\n\n', start) + 3
const body = source.slice(start, end)

test('mirror device scope uses canonical devices.owner_user_id', () => {
  assert.match(body, /\.select\('id, device_id, owner_user_id'\)/)
  assert.match(body, /\.eq\('owner_user_id', ownerId\)/)
})

test('mirror device scope does not probe removed ownership columns', () => {
  assert.doesNotMatch(body, /id, device_id, owner_id/)
  assert.doesNotMatch(body, /id, device_id, user_id/)
  assert.doesNotMatch(body, /\.eq\('owner_id',/)
})
