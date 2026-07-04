import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const builder = readFileSync(new URL('../app/api/device/frame-config/builder.ts', import.meta.url), 'utf8')
const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')

test('device frame-config requires pairing before falling back to defaults', () => {
  assert.match(builder, /deviceHasOwnerAccessLink/)
  assert.match(builder, /pairRequiredPayload/)
  assert.match(builder, /if \(!hasOwnerAccessLink\) return pairRequiredPayload\(device_id\)/)
  assert.match(builder, /pair_required: true/)
  assert.match(builder, /unpaired: true/)
  assert.match(builder, /status: 'unpaired'/)

  const ownerCheckIndex = builder.indexOf('if (!hasOwnerAccessLink) return pairRequiredPayload(device_id)')
  const defaultConfigIndex = builder.indexOf("theme: 'dark'")
  assert.ok(ownerCheckIndex >= 0 && defaultConfigIndex >= 0 && ownerCheckIndex < defaultConfigIndex)
})

test('mirror-snapshot returns unpaired response before auth/default mirror payload', () => {
  assert.match(mirrorRoute, /deviceHasOwnerAccessLink/)
  assert.match(mirrorRoute, /return NextResponse\.json\(pairRequiredPayload\(deviceId\)\)/)
  assert.match(mirrorRoute, /frameConfig\.pair_required === true \|\| frameConfig\.unpaired === true/)

  const unpairedIndex = mirrorRoute.indexOf('return NextResponse.json(pairRequiredPayload(deviceId))')
  const bearerIndex = mirrorRoute.indexOf('const bearer = getBearerToken(req)')
  assert.ok(unpairedIndex >= 0 && bearerIndex >= 0 && unpairedIndex < bearerIndex)
})
