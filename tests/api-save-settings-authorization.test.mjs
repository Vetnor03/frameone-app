import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../app/api/device/save-settings/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function harness({ user = 'user-A', device = 'frm_A', invalidToken = false, membershipError = false } = {}) {
  const calls = []
  const owned = {
    'user-A': 'frm_A',
    'user-B': 'frm_B',
  }

  const db = {
    auth: {
      async getUser(token) {
        calls.push(['getUser', token])
        return { data: { user: invalidToken ? null : { id: user } } }
      },
    },
    from(table) {
      calls.push(['from', table])
      let operation = 'read'
      let deviceId = null
      let queriedUser = null
      let payload = null
      return {
        select() { return this },
        eq(column, value) {
          if (column === 'device_id') deviceId = value
          if (column === 'user_id') queriedUser = value
          return this
        },
        update(value) { operation = 'update'; payload = value; calls.push(['update', table]); return this },
        insert(value) { operation = 'insert'; payload = value; calls.push(['insert', table]); return this },
        async maybeSingle() {
          if (table === 'device_members') {
            assert.equal(deviceId, device)
            assert.equal(queriedUser, user)
            return membershipError
              ? { data: null, error: { message: 'synthetic DB failure' } }
              : { data: owned[user] === device ? { role: 'owner' } : null, error: null }
          }
          assert.equal(table, 'device_settings')
          if (operation === 'read') return { data: { device_id: device }, error: null }
          assert.equal(deviceId, device)
          assert.deepEqual(payload, { settings_json: { theme: 'dark' } })
          return { data: { settings_json: { theme: 'dark' }, updated_at: '2026-09-28T00:00:00Z' }, error: null }
        },
      }
    },
  }

  const imports = {
    'next/server': { NextResponse: { json: (value, options = {}) => Response.json(value, options) } },
    '@supabase/supabase-js': { createClient: () => db },
    '@/app/lib/customLayouts': { supportsPhysicalCustomLayout: () => ({ valid: true }) },
  }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    (name) => {
      assert.ok(Object.hasOwn(imports, name), 'unknown dependency: ' + name)
      return imports[name]
    },
    mod,
    mod.exports,
  )

  const request = (token = 'synthetic-token') =>
    mod.exports.POST(new Request('http://localhost/api/device/save-settings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ device_id: device, settings_json: { theme: 'dark' } }),
    }))

  return { request, calls }
}

test('missing or invalid auth cannot reach membership or settings writes', async () => {
  const missing = harness()
  assert.equal((await missing.request('')).status, 401)
  assert.deepEqual(missing.calls, [])

  const invalid = harness({ invalidToken: true })
  assert.equal((await invalid.request()).status, 401)
  assert.equal(invalid.calls.some(([operation]) => operation === 'from'), false)
})

test('Tester A cannot POST settings for Tester B and no update/insert runs', async () => {
  const h = harness({ user: 'user-A', device: 'frm_B' })
  const response = await h.request()
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error, 'forbidden')
  assert.equal(h.calls.some(([name]) => name === 'update' || name === 'insert'), false)
  assert.equal(h.calls.some(([name, table]) => name === 'from' && table === 'device_settings'), false)
})

test('Tester B cannot POST settings for Tester A and no update/insert runs', async () => {
  const h = harness({ user: 'user-B', device: 'frm_A' })
  const response = await h.request()
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error, 'forbidden')
  assert.equal(h.calls.some(([name]) => name === 'update' || name === 'insert'), false)
})

test('membership read failure fails closed without settings write', async () => {
  const h = harness({ membershipError: true })
  assert.equal((await h.request()).status, 500)
  assert.equal(h.calls.some(([name]) => name === 'update' || name === 'insert'), false)
})

test('own-device request still reaches normal save path', async () => {
  for (const [user, device] of [['user-A', 'frm_A'], ['user-B', 'frm_B']]) {
    const h = harness({ user, device })
    const response = await h.request()
    assert.equal(response.status, 200)
    assert.equal((await response.json()).ok, true)
    assert.equal(h.calls.some(([name]) => name === 'update'), true)
  }
})
