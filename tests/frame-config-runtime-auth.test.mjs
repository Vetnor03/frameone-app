import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function loadModule(path, imports) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const loadedModule = { exports: {} }
  const requireMock = (name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`)
    return imports[name]
  }

  new Function('require', 'module', 'exports', compiled)(
    requireMock, loadedModule, loadedModule.exports
  )

  return loadedModule.exports
}

function harness(options = {}) {
  const state = {
    owned: true,
    deviceToken: 'correct-token',
    databaseError: false,
    payload: {
      device_id: 'frm_test',
      settings_json: { cells: [] },
      updated_at: null,
    },
    ...options,
  }

  const calls = []

  const supabase = {
    from(table) {
      assert.equal(table, 'devices')
      return {
        select(columns) {
          assert.equal(columns, 'device_id, device_token')
          return {
            eq(column, value) {
              assert.equal(column, 'device_id')
              assert.equal(value, 'frm_test')
              return {
                async maybeSingle() {
                  calls.push('token_lookup')
                  if (state.databaseError) {
                    return { data: null, error: { message: 'Database unavailable' } }
                  }
                  return {
                    data: { device_id: 'frm_test', device_token: state.deviceToken },
                    error: null,
                  }
                },
              }
            },
          }
        },
      }
    },
    async rpc(name, args) {
      calls.push('pairing')
      assert.equal(name, 'start_pairing')
      assert.equal(args.p_device_id, 'frm_test')
      return {
        data: { pair_code: 'ABCD', expires_in: 600 },
        error: null,
      }
    },
  }

  const auth = loadModule('../app/lib/device/updateStateAuth.ts', {
    '@/app/lib/supabase/serviceClient': {
      createServiceClient: () => supabase,
    },
  })

  class MockNextResponse extends Response {
    static json(value, init = {}) {
      return Response.json(value, init)
    }
  }

  const route = loadModule('../app/api/device/frame-config/route.ts', {
    'next/server': { NextResponse: MockNextResponse },
    '@/app/lib/supabase/serviceClient': {
      createServiceClient: () => supabase,
    },
    '@/app/lib/device/updateStateAuth': auth,
    './builder': {
      async deviceHasOwnerAccessLink() {
        calls.push('ownership')
        return state.owned
      },
      async buildFrameConfigPayload() {
        calls.push('build')
        return state.payload
      },
      pairRequiredPayload(deviceId, fields) {
        return {
          device_id: deviceId,
          pair_required: true,
          unpaired: true,
          status: 'unpaired',
          settings_json: null,
          updated_at: null,
          ...fields,
        }
      },
    },
  })

  async function request(token) {
    const headers = token ? { authorization: `Bearer ${token}` } : {}
    return route.GET(new Request(
      'http://localhost/api/device/frame-config?device_id=frm_test',
      { headers }
    ))
  }

  return { request, calls }
}

test('unpaired device receives pairing without authentication', async () => {
  const h = harness({ owned: false })
  const response = await h.request()

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.pair_required, true)
  assert.equal(body.pairing_code, 'ABCD')
  assert.deepEqual(h.calls, ['ownership', 'pairing'])
})

test('paired device without token receives 401', async () => {
  const h = harness()
  const response = await h.request()

  assert.equal(response.status, 401)
  assert.ok(!h.calls.includes('build'))
})

test('paired device with incorrect token receives 401', async () => {
  const h = harness()
  const response = await h.request('incorrect-token')

  assert.equal(response.status, 401)
  assert.ok(h.calls.includes('token_lookup'))
  assert.ok(!h.calls.includes('build'))
})

test('correct device token returns configuration', async () => {
  const h = harness()
  const response = await h.request('correct-token')

  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.settings_json, { cells: [] })
  assert.deepEqual(h.calls, ['ownership', 'token_lookup', 'build'])
})

test('authenticated setup-pending device keeps its response', async () => {
  const h = harness({
    payload: {
      device_id: 'frm_test',
      setup_pending: true,
      status: 'waiting_for_setup',
      settings_json: null,
      updated_at: null,
    },
  })

  const response = await h.request('correct-token')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).setup_pending, true)
})

test('pairing-state race returns 409 rather than unpairing response', async () => {
  const h = harness({
    payload: { device_id: 'frm_test', pair_required: true },
  })

  const response = await h.request('correct-token')
  assert.equal(response.status, 409)
  assert.ok(!h.calls.includes('pairing'))
})

test('database authentication failure returns 500, not 401', async () => {
  const h = harness({ databaseError: true })
  const response = await h.request('correct-token')

  assert.equal(response.status, 500)
  assert.ok(!h.calls.includes('build'))
})
