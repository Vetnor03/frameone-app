import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const helper = read('app/lib/device/pairingRollout.ts')
const start = read('app/api/device/pair/start/route.ts')
const status = read('app/api/device/pair/status/route.ts')
const config = read('app/api/device/frame-config/route.ts')

function compile(source, dependencies) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', output)(
    (name) => {
      assert.ok(Object.hasOwn(dependencies, name), 'unexpected dependency: ' + name)
      return dependencies[name]
    },
    mod,
    mod.exports,
  )
  return mod.exports
}

const rollout = compile(helper, {})
const STAGING = {
  VERCEL_PROJECT_ID: 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR',
  REMIND_STAGING_VERCEL_PROJECT_ID: 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR',
  REMIND_STAGING_SUPABASE_REF: 'ouwhfzjaahdipwmelzvf',
  NEXT_PUBLIC_SUPABASE_URL: 'https://ouwhfzjaahdipwmelzvf.supabase.co',
}

test('quarantine is pinned to both independent projects, never generic Preview or production', () => {
  assert.equal(rollout.legacyPairingQuarantined(STAGING), true)
  assert.equal(rollout.legacyPairingQuarantined({ ...STAGING, VERCEL_ENV: 'production' }), true)
  assert.equal(rollout.legacyPairingQuarantined({ ...STAGING, VERCEL_ENV: 'preview' }), true)
  for (const [key, wrong] of [
    ['VERCEL_PROJECT_ID', 'prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0'],
    ['REMIND_STAGING_VERCEL_PROJECT_ID', 'prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0'],
    ['REMIND_STAGING_SUPABASE_REF', 'bzkqyllgccswrfudmexm'],
    ['NEXT_PUBLIC_SUPABASE_URL', 'https://bzkqyllgccswrfudmexm.supabase.co'],
  ]) assert.equal(rollout.legacyPairingQuarantined({ ...STAGING, [key]: wrong }), false, key)
  assert.equal(rollout.legacyPairingQuarantined({ VERCEL_ENV: 'preview' }), false)
  assert.deepEqual(rollout.LEGACY_PAIRING_DISABLED_RESPONSE, { error: 'legacy_pairing_disabled' })
})

function legacyRoute(source, staged) {
  const calls = []
  const db = {
    rpc(name, args) {
      calls.push([name, args])
      return Promise.resolve(name === 'start_pairing'
        ? { data: { pair_code: 'TEST' }, error: null }
        : { data: { paired: true, device_token: 'fake-test-only-token' }, error: null })
    },
  }
  const mod = compile(source, {
    'next/server': { NextResponse: { json: (data, init = {}) => Response.json(data, init) } },
    '@supabase/supabase-js': { createClient() { calls.push(['createClient']); return db } },
    '@/app/lib/device/pairingRollout': {
      legacyPairingQuarantined: () => staged,
      LEGACY_PAIRING_DISABLED_RESPONSE: { error: 'legacy_pairing_disabled' },
    },
  })
  return { mod, calls }
}

test('staging /pair/start rejects before creating service client or calling start_pairing', async () => {
  const h = legacyRoute(start, true)
  const resp = await h.mod.GET(new Request('http://test.local/api/device/pair/start?device_id=frm_FA0000000001'))
  assert.equal(resp.status, 410)
  assert.deepEqual(await resp.json(), { error: 'legacy_pairing_disabled' })
  assert.equal(resp.headers.get('cache-control'), 'no-store')
  assert.deepEqual(h.calls, [])
})

test('staging /pair/status cannot read or mint any legacy token', async () => {
  const h = legacyRoute(status, true)
  const resp = await h.mod.GET(new Request('http://test.local/api/device/pair/status?device_id=frm_FA0000000001'))
  assert.equal(resp.status, 410)
  assert.deepEqual(await resp.json(), { error: 'legacy_pairing_disabled' })
  assert.equal(resp.headers.get('cache-control'), 'no-store')
  assert.deepEqual(h.calls, [])
})

test('non-staging legacy paths are unchanged while firmware is migrated', async () => {
  const h = legacyRoute(start, false)
  const resp = await h.mod.GET(new Request('http://test.local/api/device/pair/start?device_id=frm_test'))
  assert.equal(resp.status, 200)
  assert.equal((await resp.json()).pair_code, 'TEST')
  assert.ok(h.calls.some(([name]) => name === 'start_pairing'))

  const p = legacyRoute(status, false)
  const result = await p.mod.GET(new Request('http://test.local/api/device/pair/status?device_id=frm_test'))
  assert.equal(result.status, 200)
  assert.equal((await result.json()).paired, true)
  assert.ok(p.calls.some(([name]) => name === 'get_pair_status'))
})

function configRoute(staged, owned) {
  const calls = []
  const rpc = {
    async rpc(name, args) {
      calls.push([name, args])
      return { data: { pair_code: 'TEST', expires_in: 120 }, error: null }
    },
  }
  const mod = compile(config, {
    'next/server': { NextResponse: { json: (data, init = {}) => Response.json(data, init) } },
    '@/app/lib/supabase/serviceClient': {
      createServiceClient: () => { calls.push(['serviceClient']); return rpc },
    },
    '@/app/lib/device/updateStateAuth': {
      authenticatePhysicalDevice: async () => {
        calls.push(['physicalAuth'])
        return { error: 'missing_auth_token', status: 401 }
      },
    },
    './builder': {
      deviceHasOwnerAccessLink: async () => { calls.push(['ownerCheck']); return owned },
      pairRequiredPayload: (id, row) => ({ device_id: id, pair_required: true, ...row }),
      buildFrameConfigPayload: async () => ({ device_id: 'frm_test', pair_required: false }),
    },
    '@/app/lib/device/pairingRollout': {
      legacyPairingQuarantined: () => staged,
      LEGACY_PAIRING_DISABLED_RESPONSE: { error: 'legacy_pairing_disabled' },
    },
  })
  return { mod, calls }
}

test('unpaired frame-config cannot bypass staging quarantine through start_pairing RPC', async () => {
  const h = configRoute(true, false)
  const resp = await h.mod.GET(new Request('http://test.local/api/device/frame-config?device_id=frm_test'))
  assert.equal(resp.status, 410)
  assert.deepEqual(await resp.json(), { error: 'legacy_pairing_disabled' })
  assert.equal(resp.headers.get('cache-control'), 'no-store')
  assert.equal(h.calls.some(([name]) => name === 'start_pairing'), false)
})

test('staging still authenticates a paired frame, not a blanket frame-config shutdown', async () => {
  const h = configRoute(true, true)
  const resp = await h.mod.GET(new Request('http://test.local/api/device/frame-config?device_id=frm_test'))
  assert.equal(resp.status, 401)
  assert.deepEqual(await resp.json(), { error: 'missing_auth_token' })
  assert.ok(h.calls.some(([name]) => name === 'physicalAuth'))
  assert.equal(h.calls.some(([name]) => name === 'start_pairing'), false)
})

test('non-staging unpaired frame-config retains legacy firmware compatibility', async () => {
  const h = configRoute(false, false)
  const resp = await h.mod.GET(new Request('http://test.local/api/device/frame-config?device_id=frm_test'))
  assert.equal(resp.status, 200)
  assert.equal((await resp.json()).pairing_code, 'TEST')
  assert.ok(h.calls.some(([name]) => name === 'start_pairing'))
})

test('v2 is not silently launched by this quarantine', () => {
  assert.doesNotMatch(helper, /SUPABASE_SERVICE_ROLE_KEY|getToken|saveToken|start_pairing/)
  assert.match(start, /legacyPairingQuarantined\(\)/)
  assert.match(status, /legacyPairingQuarantined\(\)/)
  assert.match(config, /if \(!hasOwnerAccessLink\) \{[\s\S]*legacyPairingQuarantined\(\)/)
})
