import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT_CAPABILITY_HANDLERS, executeCapability } from '../app/lib/assistant/handlers.ts'
import { resolveDeterministicAssistantIntent } from '../app/lib/assistant/resolver.ts'
import { ASSISTANT_CAPABILITIES } from '../app/lib/assistant/capabilities.ts'

function dbMock(rows = {}) {
  const calls = []
  const db = {
    calls,
    from(table) {
      const call = { table, filters: [], operation: 'select', value: null }; calls.push(call)
      const q = {
        select() { return q }, eq(key, value) { call.filters.push([key, value]); return q }, order() { return q },
        insert(value) { call.operation = 'insert'; call.value = value; return q }, upsert(value) { call.operation = 'upsert'; call.value = value; return q },
        single() { return Promise.resolve(rows[`${table}:insert`] ?? { data: { id: '10000000-0000-0000-0000-000000000001' }, error: null }) },
        maybeSingle() { return Promise.resolve(rows[table] ?? { data: table === 'device_members' ? { device_id: 'frame' } : null, error: null }) },
        then(resolve) { return Promise.resolve(rows[table] ?? { data: [], error: null }).then(resolve) },
      }
      return q
    },
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve({ data: true, error: null }) },
  }
  return db
}

const user = { id: 'user' }
function context(db, extra = {}) { return { db, admin: extra.admin ?? db, user, deviceId: 'frame', language: 'en', localNow: '2026-07-15T08:00:00Z', timezone: 'Europe/Oslo', authorization: 'Bearer x', ...extra } }

test('football write and core reads execute against current canonical data', async () => {
  const db = dbMock({ device_settings: { data: { settings_json: { theme: 'dark', modules: { soccer: [{ id: 1, teamId: 'arsenal', teamName: 'Arsenal' }] } } }, error: null }, grocery_items: { data: [{ name: 'Milk' }], error: null }, reminders: { data: [{ title: 'Call Mum' }], error: null } })
  const changed = await executeCapability('football.set_team', { team: 'Dortmund' }, context(db))
  assert.match(changed.message, /Borussia Dortmund/)
  const save = db.calls.find((call) => call.rpc === 'upsert_device_settings')
  assert.equal(save.args.p_settings.theme, 'dark')
  assert.equal(save.args.p_settings.modules.soccer[0].teamId, 'dortmund')
  assert.match((await executeCapability('football.read', {}, context(db))).message, /Arsenal/)
  assert.equal((await executeCapability('groceries.read', {}, context(db))).message, 'Milk')
  assert.equal((await executeCapability('reminders.read', {}, context(db))).message, 'Call Mum')
})

test('structured capability validators reject invalid values before execution', () => {
  for (const capability of ASSISTANT_CAPABILITIES) assert.ok(ASSISTANT_CAPABILITY_HANDLERS[capability.id], capability.id)
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS['frame.set_language'].validate({ language: 'fr' }).ok, false)
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS['frame.set_layout'].validate({ layout: 'custom-hack' }).ok, false)
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS['countdown.create'].validate({ title: '', targetDate: '2026-10-10' }).ok, false)
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS['countdown.create'].validate({ title: 'Trip', targetDate: '10/10/2026' }).ok, false)
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS['settings.set_app_theme'].validate({ theme: 'blue' }).ok, false)
  assert.equal(ASSISTANT_CAPABILITY_HANDLERS['surf.log_experience'].validate({ spot: 'Hellestø', rating: 7, date: 'today', time: '14:00' }).ok, false)
})

test('countdown uses the UI schema and missing arguments create generic pending state', async () => {
  const db = dbMock()
  await executeCapability('countdown.create', { title: 'Trip', targetDate: '2026-10-10' }, context(db))
  assert.deepEqual(db.calls.find((call) => call.table === 'countdown_events').value, { device_id: 'frame', title: 'Trip', target_date: '2026-10-10', pinned: false, created_by_user_id: 'user', updated_by_user_id: 'user' })
  const pending = await executeCapability('football.set_team', {}, context(db))
  assert.equal(pending.status, 'needs_input'); assert.ok(pending.pendingId)
  assert.equal(db.calls.find((call) => call.table === 'assistant_pending_actions').value.payload.missing, 'team')
})

test('weather and surf reads consume their real API response shapes', async () => {
  const weatherDb = dbMock({ device_settings: { data: { settings_json: { modules: { weather: [{ lat: 58.9, lon: 5.7 }], surf: [{ spotId: 'hellesto' }] } } }, error: null } })
  const weather = await executeCapability('weather.read', {}, context(weatherDb, { weatherDetails: async () => new Response(JSON.stringify({ weather: { current: { temperature_2m: 17 } }, marine: null })) }))
  assert.equal(weather.message, 'It is 17° now.')
  const surf = await executeCapability('surf.read', {}, context(weatherDb, { surfScore: async () => new Response(JSON.stringify({ spot: 'Hellestø', rating: 5, score: 5 })) }))
  assert.equal(surf.message, 'Hellestø: 5 out of 6.')
})

test('exact module names navigate while general questions do not invent capabilities', () => {
  for (const input of ['Settings', 'Innstillinger', 'Spond', 'Weather', 'Vær', 'Surf', 'Reminders', 'Påminnelser', 'Groceries', 'Handleliste', 'Layout', 'Oppsett']) {
    assert.equal(resolveDeterministicAssistantIntent(input)?.action, 'answer_help', input)
  }
  assert.equal(resolveDeterministicAssistantIntent('Why do birds migrate?'), null)
})
