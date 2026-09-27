import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const builder = readFileSync(new URL('../app/api/device/frame-config/builder.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/frame-config/route.ts', import.meta.url), 'utf8')

test('frame-config authenticates paired devices before returning configuration', () => {
  assert.match(route, /deviceHasOwnerAccessLink\(supabase, device_id\)/)
  assert.match(route, /authenticatePhysicalDevice\(req, device_id\)/)
  assert.match(route, /if \('error' in auth\)/)

  assert.ok(
    route.indexOf('authenticatePhysicalDevice(req, device_id)') <
    route.indexOf('buildFrameConfigPayload(supabase, device_id)')
  )

  assert.match(route, /const responseBody = JSON\.stringify\(payload\)/)
  assert.match(route, /return new NextResponse\(responseBody,/)

  assert.doesNotMatch(builder, /frame-config response size/)
  assert.doesNotMatch(route, /console\.info\(responseBody\)/)
  assert.doesNotMatch(route, /frm_54AE37455F34/)
})

test('canonical owner prevents an owned frame from being treated as unpaired', () => {
  assert.match(builder, /device\?\.owner_user_id/)
  assert.match(builder, /if \(ownerUserId \|\| ownerId \|\| userId\) return true/)
})
