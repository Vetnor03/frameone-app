import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const builder = readFileSync(new URL('../app/api/device/frame-config/builder.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/frame-config/route.ts', import.meta.url), 'utf8')

test('frame-config logs only the final serialized response body for the requested device', () => {
  assert.doesNotMatch(builder, /frame-config response size/)
  assert.match(route, /const responseBody = JSON\.stringify\(payload\)/)
  assert.match(route, /device_id === 'frm_54AE37455F34'/)
  assert.match(route, /console\.info\(responseBody\)/)
  assert.match(route, /return new NextResponse\(responseBody,/)
})
