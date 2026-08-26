import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT_CAPABILITY_HANDLERS, executeCapability } from '../app/lib/assistant/handlers.ts'
import { resolveDeterministicAssistantIntent, resolveDeterministicCapabilityRequest, validateCapabilityClassification } from '../app/lib/assistant/resolver.ts'
import { ASSISTANT_CAPABILITIES } from '../app/lib/assistant/capabilities.ts'
import { transitionBuiltInLayoutSettings } from '../app/lib/frameLayoutTransition.ts'
import { normalizeCapabilityArgument, normalizeCapabilityArguments } from '../app/lib/assistant/normalization.ts'
import { applyDocumentTheme } from '../app/lib/theme.ts'
import { readFileSync } from 'node:fs'

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

test('app theme capability returns the saved theme for immediate client state synchronization', async () => {
  const db = dbMock()
  for (const theme of ['dark', 'light']) {
    const result = await executeCapability('settings.set_app_theme', { theme }, context(db))
    assert.equal(result.status, 'completed')
    assert.equal(result.appTheme, theme)
    assert.deepEqual(db.calls.at(-1).value, { user_id: 'user', app_theme: theme })
  }

  const assistant = readFileSync(new URL('../app/components/FrameAssistant.tsx', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(assistant, /isAppTheme\(value\.appTheme\)\) onAppThemeChange\(value\.appTheme\)/)
  assert.match(home, /onAppThemeChange=\{\(theme\) => \{ applyDocumentTheme\(theme\); persistTheme\(theme\); setAppTheme\(theme\) \}\}/)
  assert.doesNotMatch(`${assistant}\n${home}`, /window\.location\.reload|location\.reload/)
  const completedResponse = assistant.match(/if \(value\?\.status === 'completed'\) \{([\s\S]*?)\n      \}/)?.[1] ?? ''
  assert.doesNotMatch(completedResponse, /setOpen\(false\)/)
})

test('canonical document theme application updates browser and safe-area backing immediately', () => {
  const meta = { content: '' }
  const originalDocument = globalThis.document
  globalThis.document = { documentElement: { dataset: {}, style: {} }, body: { style: {} }, querySelector: () => meta }
  try {
    for (const [theme, color] of [['dark', '#061b24'], ['light', '#f5f6f8']]) {
      applyDocumentTheme(theme)
      assert.equal(document.documentElement.dataset.theme, theme)
      assert.equal(document.documentElement.style.colorScheme, theme)
      assert.equal(document.documentElement.style.backgroundColor, color)
      assert.equal(document.body.style.backgroundColor, color)
      assert.equal(meta.content, color)
    }
  } finally {
    globalThis.document = originalDocument
  }
})

test('Assistant exposes localized working state only while a request is busy', () => {
  const assistant = readFileSync(new URL('../app/components/FrameAssistant.tsx', import.meta.url), 'utf8')
  assert.match(assistant, /working: 'Jobber…'/)
  assert.match(assistant, /working: 'Working…'/)
  assert.match(assistant, /busy && <div role="status" aria-live="polite"[\s\S]*\{copy\.working\}/)
  assert.match(assistant, /finally \{ setBusy\(false\) \}/)
  assert.match(assistant, /\{result && <div aria-live="polite"/)
})

test('countdown uses the UI schema and missing arguments create generic pending state', async () => {
  const db = dbMock()
  await executeCapability('countdown.create', { title: 'Trip', targetDate: '2026-10-10' }, context(db))
  assert.deepEqual(db.calls.find((call) => call.table === 'countdown_events').value, { device_id: 'frame', title: 'Trip', target_date: '2026-10-10', pinned: false, created_by_user_id: 'user', updated_by_user_id: 'user' })
  const pending = await executeCapability('football.set_team', {}, context(db))
  assert.equal(pending.status, 'needs_input'); assert.ok(pending.pendingId)
  assert.equal(db.calls.find((call) => call.table === 'assistant_pending_actions').value.payload.missing, 'team')
})

test('weather reads use current data now and tomorrow index for tomorrow', async () => {
  const weatherDb = dbMock({ device_settings: { data: { settings_json: { modules: { weather: [{ lat: 58.9, lon: 5.7 }], surf: [{ spotId: 'hellesto' }] } } }, error: null } })
  const response = { weather: { current: { temperature_2m: 17 }, daily: { time: ['2026-07-15', '2026-07-16'], temperature_2m_max: [19, 23], temperature_2m_min: [12, 14], precipitation_sum: [0, 2.4] } }, marine: null }
  const adapter = async () => new Response(JSON.stringify(response))
  assert.equal((await executeCapability('weather.read', { period: 'current' }, context(weatherDb, { weatherDetails: adapter }))).message, 'It is 17° now.')
  const tomorrow = await executeCapability('weather.read', { period: 'tomorrow' }, context(weatherDb, { weatherDetails: adapter }))
  assert.equal(tomorrow.message, 'Tomorrow will be 14–23°, with 2.4 mm of precipitation.')
  assert.doesNotMatch(tomorrow.message, /17/)
})

test('surf reads use current score now and daily index one for tomorrow', async () => {
  const db = dbMock({ device_settings: { data: { settings_json: { modules: { surf: [{ spotId: 'hellesto' }] } } }, error: null } })
  const requested = []
  const adapter = async (request) => { requested.push(request.url); return new Response(JSON.stringify({ spot: 'Hellestø', rating: 5, score: 5, daily: [{ rating: 4 }, { rating: 2, line1: '1.1 m', line2: 'Onshore' }] })) }
  assert.equal((await executeCapability('surf.read', { period: 'today' }, context(db, { surfScore: adapter }))).message, 'Hellestø: 5 out of 6.')
  const tomorrow = await executeCapability('surf.read', { spot: 'Hellestø', period: 'tomorrow' }, context(db, { surfScore: adapter }))
  assert.equal(tomorrow.message, 'Hellestø tomorrow: 2 out of 6 — 1.1 m · Onshore.')
  assert.match(requested[1], /daily=1&days=2/)
})

test('Assistant layout transition matches FRAME projection and preserves settings', async () => {
  const original = { theme: 'dark', language: 'no', custom_layout_id: 'old-custom', modules: { weather: [{ id: 1 }] }, cells: [{ slot: 0, module: 'date' }, { slot: 1, module: 'weather:1' }, { slot: 2, module: 'reminders' }], layout: 'default', layout_module_memory: ['date', 'weather', 'reminders', 'assistant'] }
  const expected = transitionBuiltInLayoutSettings(original, 'pyramid')
  const db = dbMock({ device_settings: { data: { settings_json: original }, error: null } })
  await executeCapability('frame.set_layout', { layout: 'layout 2' }, context(db))
  const saved = db.calls.find((call) => call.rpc === 'upsert_device_settings').args.p_settings
  assert.deepEqual(saved, expected)
  assert.equal(saved.layout, 'pyramid')
  assert.deepEqual(saved.cells, [{ slot: 0, module: 'date' }, { slot: 1, module: 'weather:1' }, { slot: 2, module: 'reminders' }, { slot: 3, module: 'assistant' }])
  assert.deepEqual(saved.layout_module_memory, ['date', 'weather', 'reminders', 'assistant'])
  assert.deepEqual(saved.modules, original.modules)
  assert.equal(saved.custom_layout_id, undefined)
})

test('exact module names navigate while general questions do not invent capabilities', () => {
  for (const input of ['Settings', 'Innstillinger', 'Spond', 'Weather', 'Vær', 'Surf', 'Reminders', 'Påminnelser', 'Groceries', 'Handleliste', 'Layout', 'Oppsett']) {
    assert.equal(resolveDeterministicAssistantIntent(input)?.action, 'answer_help', input)
  }
  assert.equal(resolveDeterministicAssistantIntent('Why do birds migrate?'), null)
  assert.deepEqual(resolveDeterministicAssistantIntent('Hvordan blir været i morgen?'), { action: 'capability', arguments: { id: 'weather.read', values: { period: 'tomorrow' } } })
  assert.deepEqual(resolveDeterministicAssistantIntent('Hvordan blir Hellestø i morgen?'), { action: 'capability', arguments: { id: 'surf.read', values: { spot: 'Hellestø', period: 'tomorrow' } } })
})

test('natural requests resolve to control-plane capability IDs and normalized arguments', () => {
  const cases = [
    ['Bytt fotballag til Dortmund', 'football.set_team'], ['Hvilket fotballag følger jeg?', 'football.read'],
    ['Soyasaus', 'groceries.add'], ['Hva står på handlelisten?', 'groceries.read'], ['Ring mamma i morgen', 'reminders.create'],
    ['Hvordan blir været i morgen?', 'weather.read'], ['Hvordan blir Hellestø i morgen?', 'surf.read'], ['Hellestø var dårlig i dag', 'surf.log_experience'],
    ['Lag nedtelling til ferie 10. september', 'countdown.create'], ['Bytt appen til dark mode', 'settings.set_app_theme'],
    ['Bytt språk til norsk', 'frame.set_language'], ['Bytt til layout 2', 'frame.set_layout'],
  ]
  for (const [request, capabilityId] of cases) assert.equal(resolveDeterministicCapabilityRequest(request)?.capabilityId, capabilityId, request)
  const countdown = resolveDeterministicCapabilityRequest('Lag nedtelling til ferie 10. september')
  assert.equal(normalizeCapabilityArguments(countdown.arguments, { localNow: '2026-08-26T10:00:00Z', timezone: 'Europe/Oslo' }).targetDate, '2026-09-10')
})

test('generic follow-up normalization covers app argument vocabulary', () => {
  const context = { localNow: '2026-08-26T10:00:00Z', timezone: 'Europe/Oslo' }
  assert.equal(normalizeCapabilityArgument('targetDate', '10. september', context), '2026-09-10')
  assert.equal(normalizeCapabilityArgument('time', 'kl 14.30', context), '14:30')
  assert.equal(normalizeCapabilityArgument('theme', 'mørkt', context), 'dark')
  assert.equal(normalizeCapabilityArgument('language', 'norsk', context), 'no')
  assert.equal(normalizeCapabilityArgument('layout', 'oppsett 2', context), 'pyramid')
  assert.equal(normalizeCapabilityArgument('rating', 'det var 3', context), 3)
  assert.equal(normalizeCapabilityArgument('date', 'i går', context), 'yesterday')
})

test('Assistant navigation exhaustively handles every destination', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  for (const destination of ['settings', 'surf', 'weather', 'groceries', 'recipes', 'reminders', 'spond', 'countdown', 'date', 'football', 'stocks', 'assistant', 'layout']) assert.match(home, new RegExp(`case '${destination}'`))
  assert.match(home, /const exhaustive: never = destination/)
})

test('registry-driven AI fallback accepts registered paraphrase classifications only', () => {
  assert.deepEqual(validateCapabilityClassification({ capabilityId: 'football.read', arguments: {} }), { capabilityId: 'football.read', arguments: {} })
  assert.deepEqual(validateCapabilityClassification({ capabilityId: 'settings.set_app_theme', arguments: { theme: 'make the interface nocturnal', spot: null } }), { capabilityId: 'settings.set_app_theme', arguments: { theme: 'make the interface nocturnal' } })
  assert.deepEqual(validateCapabilityClassification({ capabilityId: 'countdown.create', arguments: { title: 'Summer break', targetDate: '10 September' } }), { capabilityId: 'countdown.create', arguments: { title: 'Summer break', targetDate: '10 September' } })
  assert.equal(validateCapabilityClassification({ capabilityId: 'made.up', arguments: {} }), null)
  assert.equal(validateCapabilityClassification({ capabilityId: 'unsupported', arguments: {} }), null)
})
