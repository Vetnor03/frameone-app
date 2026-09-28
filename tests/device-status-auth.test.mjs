import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const routeSource = readFileSync(new URL('../app/api/device/status/route.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const firmwareSource = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://status-test.invalid'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'status-test-public-key'

function harness({ userId = 'user-A', physicalToken = 'device-A-secret', dbError = false, cookieUser = null } = {}) {
  const calls = []
  const membership = {
    'user-A': 'frm_A',
    'user-B': 'frm_B',
  }
  const physical = {
    frm_A: 'device-A-secret',
    frm_B: 'device-B-secret',
  }

  const db = {
    from(table) {
      calls.push(['from', table])
      assert.equal(table, 'device_status')
      let selected = false
      let operation = ''
      let filteredId = ''
      let payload
      return {
        select() { selected = true; return this },
        eq(column, value) {
          assert.equal(column, 'device_id')
          filteredId = value
          return this
        },
        async maybeSingle() {
          assert.ok(selected)
          if (dbError) return { data: null, error: { message: 'private database error' } }
          return {
            data: filteredId === 'frm_A' ? {
              current_version: '2.7.2',
              battery_percent: 48,
              battery_voltage: 3.73,
              is_charging: true,
              is_usb_present: true,
              last_seen_at: '2026-09-28T12:00:00Z',
              last_render_at: '2026-09-28T11:59:00Z',
            } : null,
            error: null,
          }
        },
        upsert(row, opts) {
          operation = 'upsert'
          payload = row
          assert.deepEqual(opts, { onConflict: 'device_id' })
          calls.push([operation, table, payload])
          return { error: dbError ? { message: 'private database error' } : null }
        },
      }
    },
  }
  const fakeAuth = {
    createServiceClient: () => db,
    deviceIdFrom(value) {
      if (typeof value !== 'string') return ''
      const id = value.trim()
      return id.length > 0 && id.length <= 128 && !/[\u0000-\u001f\u007f]/.test(id) ? id : ''
    },
    async authenticateUserForDevice(req, deviceId) {
      calls.push(['user_auth', deviceId])
      const bearer = req.headers.get('authorization')
      if (!bearer) return { error: 'missing_auth_token', status: 401 }
      if (bearer !== 'Bearer user-' + userId) return { error: 'invalid_auth_token', status: 401 }
      if (membership[userId] !== deviceId) return { error: 'forbidden', status: 403 }
      return { supabase: db, userId }
    },
    async authenticatePhysicalDevice(req, deviceId) {
      calls.push(['physical_auth', deviceId])
      const bearer = req.headers.get('authorization')
      if (!bearer) return { error: 'missing_auth_token', status: 401 }
      if (bearer !== 'Bearer ' + physical[deviceId] || !physical[deviceId]) {
        return { error: 'unauthorized', status: 401 }
      }
      return { supabase: db }
    },
  }

  const transpiled = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  const imports = {
    'next/server': { NextResponse: { json: (value, init = {}) => Response.json(value, init) } },
    'next/headers': { cookies: async () => ({ getAll: () => [], set() {} }) },
    '@supabase/ssr': { createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: cookieUser ? { id: cookieUser } : null }, error: null }) },
      from(table) {
        assert.equal(table, 'device_members')
        let selectedDevice = ''
        let selectedUser = ''
        return {
          select() { return this },
          eq(column, value) {
            if (column === 'device_id') selectedDevice = value
            if (column === 'user_id') selectedUser = value
            return this
          },
          async maybeSingle() {
            assert.equal(selectedUser, cookieUser)
            return { data: membership[cookieUser] === selectedDevice ? { device_id: selectedDevice } : null, error: null }
          },
        }
      },
    }) },
    '@/app/lib/device/updateStateAuth': fakeAuth,
  }
  new Function('require', 'module', 'exports', transpiled)(
    (name) => {
      assert.ok(Object.hasOwn(imports, name), 'Unexpected dependency: ' + name)
      return imports[name]
    },
    mod,
    mod.exports,
  )

  async function get(deviceId = 'frm_A', bearer = 'user-' + userId) {
    return mod.exports.GET(new Request(
      'http://localhost/api/device/status?device_id=' + encodeURIComponent(deviceId),
      bearer === null ? {} : { headers: { authorization: 'Bearer ' + bearer } },
    ))
  }

  async function post(deviceId = 'frm_A', bearer = physicalToken, body = {}) {
    return mod.exports.POST(new Request('http://localhost/api/device/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer === null ? {} : { Authorization: 'Bearer ' + bearer }),
      },
      body: JSON.stringify({
        device_id: deviceId,
        current_version: '2.7.2',
        battery_percent: 48,
        battery_voltage: 3.7324,
        is_charging: true,
        did_render: true,
        ...body,
      }),
    }))
  }

  return { get, post, calls }
}

test('GET rejects no-session and foreign-user requests before status read', async () => {
  const h = harness()
  assert.equal((await h.get('frm_A', null)).status, 401)
  assert.equal((await h.get('frm_B')).status, 403)
  assert.equal((await h.get('frm_A', 'forged')).status, 401)
  assert.equal(h.calls.some(([operation]) => operation === 'from'), false)
})

test('GET returns only member telemetry with private no-store cache policy', async () => {
  const a = harness()
  const own = await a.get()
  assert.equal(own.status, 200)
  assert.equal(own.headers.get('cache-control'), 'private, no-store, max-age=0')
  assert.equal((await own.json()).battery_percent, 48)

  const b = harness({ userId: 'user-B' })
  assert.equal((await b.get('frm_B')).status, 200)
  assert.equal((await b.get('frm_A')).status, 403)
})

test('POST rejects missing/forged/user/wrong-device token before upsert', async () => {
  const h = harness()
  for (const bearer of [null, 'forged', 'user-user-A', 'device-B-secret']) {
    const response = await h.post('frm_A', bearer)
    assert.equal(response.status, 401)
  }
  const cross = await h.post('frm_B', 'device-A-secret')
  assert.equal(cross.status, 401)
  assert.equal(h.calls.some(([operation]) => operation === 'from' || operation === 'upsert'), false)
})

test('physical frame POST preserves data and did_render bookkeeping', async () => {
  const h = harness()
  const response = await h.post()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.battery_percent, 48)
  const row = h.calls.find(([operation]) => operation === 'upsert')?.[2]
  assert.equal(row.device_id, 'frm_A')
  assert.equal(row.battery_voltage, 3.732)
  assert.ok(row.last_seen_at)
  assert.ok(row.last_refresh_at)
  assert.ok(row.last_render_at)
})

test('no-render status never forges last_render_at or last_refresh_at', async () => {
  const h = harness()
  const response = await h.post('frm_A', 'device-A-secret', { did_render: false })
  assert.equal(response.status, 200)
  const row = h.calls.find(([operation]) => operation === 'upsert')?.[2]
  assert.equal(Object.hasOwn(row, 'last_render_at'), false)
  assert.equal(Object.hasOwn(row, 'last_refresh_at'), false)
})

test('status read/write failures do not leak database error details', async () => {
  const h = harness({ dbError: true })
  const read = await h.get()
  assert.equal(read.status, 500)
  assert.deepEqual(await read.json(), { error: 'internal_error' })
  const write = await h.post()
  assert.equal(write.status, 500)
  assert.deepEqual(await write.json(), { error: 'internal_error' })
})

test('existing app cookies and firmware physical bearer stay compatible', () => {
  const requests = appSource.split('/api/device/status?device_id=')
  assert.equal(requests.length, 3)
  assert.match(routeSource, /createServerClient/)
  assert.match(routeSource, /caller\.auth\.getUser\(\)/)
  assert.match(routeSource, /req\.headers\.has\('authorization'\)/)
  assert.match(firmwareSource, /NetClient::httpPostAuthJson/)
  assert.match(firmwareSource, /DeviceIdentity::getToken\(\)/)
  assert.doesNotMatch(routeSource, /SUPABASE_SERVICE_ROLE_KEY/)
})
