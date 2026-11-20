import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { normalizeTodoistTask } from '../app/lib/integrations/todoist/normalize.mjs'
import { fetchTodoistTasks, TodoistApiError } from '../app/lib/integrations/todoist/client.ts'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Todoist preserves date-only task dates rather than moving them across time zones', () => {
  const task = normalizeTodoistTask({
    id: 'task_abc', content: '  Buy bread  ', priority: 4,
    due: { date: '2026-11-21', is_recurring: true },
  })
  assert.deepEqual(task, {
    external_id: 'task_abc', title: 'Buy bread', body: null,
    starts_at: '2026-11-21T12:00:00.000Z', due_at: '2026-11-21T12:00:00.000Z', priority: 0,
    raw: { source: 'todoist', type: 'task', all_day: true, date: '2026-11-21', recurring: true },
  })
})

test('Todoist respects the actual due timestamp and never invents a due date', () => {
  assert.deepEqual(normalizeTodoistTask({
    id:'t', content:'Appointment', due:{date:'2026-11-23',datetime:'2026-11-23T15:30:00+01:00'},
  }), {
    external_id:'t', title:'Appointment', body:null,
    starts_at:'2026-11-23T14:30:00.000Z', due_at:'2026-11-23T14:30:00.000Z', priority:0,
    raw: { source: 'todoist', type:'task', all_day:false, date:null, recurring:false },
  })
  assert.equal(normalizeTodoistTask({id:'t', content:'Without a due date'}), null)
  assert.equal(normalizeTodoistTask({id:'t', content:'Completed',checked:true,due:{date:'2026-11-23'}}), null)
  assert.equal(normalizeTodoistTask({id:'t', content:'Deleted',is_deleted:true,due:{date:'2026-11-23'}}), null)
  assert.equal(normalizeTodoistTask({id:'t', content:'Bad date',due:{date:'nonsense'}}), null)
})

test('Todoist floating 14:00 stays 14:00 in Norway in both winter and summer', () => {
  const winter = normalizeTodoistTask({
    id: 'floating-winter', content: 'Kronen gård',
    due: {date: '2026-11-21T14:00:00', timezone: null},
  }, {timeZone: 'Europe/Oslo'})
  assert.equal(winter?.starts_at, '2026-11-21T13:00:00.000Z')
  assert.deepEqual(winter?.raw, {
    source: 'todoist', type: 'task', all_day: false,
    date: '2026-11-21', floating_time: '14:00', recurring: false,
  })

  const floatingWithExtraTimestamp = normalizeTodoistTask({
    id: 'floating-aux', content: 'Due at 14:00',
    due: {date: '2026-11-21T14:00:00', datetime: '2026-11-21T14:00:00Z', timezone: null},
  }, {timeZone: 'Europe/Oslo'})
  assert.equal(floatingWithExtraTimestamp?.starts_at, '2026-11-21T13:00:00.000Z')
  assert.equal(floatingWithExtraTimestamp?.raw.floating_time, '14:00')

  const summer = normalizeTodoistTask({
    id: 'floating-summer', content: 'Summer surf',
    due: {date: '2026-07-21T14:00:00', timezone: null},
  }, {timeZone: 'Europe/Oslo'})
  assert.equal(summer?.starts_at, '2026-07-21T12:00:00.000Z')
  assert.equal(summer?.raw.floating_time, '14:00')
})

test('Todoist fixed UTC and offset dues remain absolute instants', () => {
  const fixedUtc = normalizeTodoistTask({
    id: 'fixed-utc', content: 'Meeting', due: {date:'2026-11-21T14:00:00Z', timezone:'Europe/Oslo'},
  }, {timeZone:'Europe/Oslo'})
  assert.equal(fixedUtc?.starts_at, '2026-11-21T14:00:00.000Z')
  assert.equal(fixedUtc?.raw.floating_time, undefined)

  const fixedOffset = normalizeTodoistTask({
    id: 'fixed-offset', content: 'Meeting', due: {datetime:'2026-11-21T14:00:00+01:00', date:'2026-11-21'},
  }, {timeZone:'Europe/Oslo'})
  assert.equal(fixedOffset?.starts_at, '2026-11-21T13:00:00.000Z')
  assert.equal(fixedOffset?.raw.floating_time, undefined)
  assert.throws(() => normalizeTodoistTask({
    id:'floating',content:'Missing account timezone',due:{date:'2026-11-21T14:00:00'},
  }), /user timezone/)
  assert.equal(normalizeTodoistTask({
    id:'dst-gap',content:'Impossible time',due:{date:'2026-03-29T02:30:00'},
  }, {timeZone:'Europe/Oslo'}), null)
})

test('Todoist app and frame show provider floating clock values rather than converting from UTC', () => {
  const app = read('app/HomePageClient.tsx')
  const feed = read('app/lib/device/remindersFeed.ts')
  assert.match(app, /row\?\.provider === 'todoist' && \^\\d\{2\}:\\d\{2\}\$/)
  assert.match(app, /raw\.floating_time as string/)
  assert.match(feed, /floatingTime \|\| \(row\.starts_at/)
  assert.match(feed, /const floatingDate = floatingTime/)
})

test('Todoist account timezone is read and saved for existing connections', () => {
  const client = read('app/lib/integrations/todoist/client.ts')
  const server = read('app/lib/integrations/todoist/server.ts')
  assert.match(client, /tz_info\?: \{timezone\?: string\}/)
  assert.match(server, /profileTimeZone\(profile\)/)
  assert.match(server, /withTodoistTimeZone\(userId, credentials\)/)
  assert.match(server, /const needsTimeZone = !decryptJson/)
  assert.match(client, /time_zone: previous\?\.time_zone/)
})

test('Todoist requests only read scope with current API v1 and cursor pagination', () => {
  const code = read('app/lib/integrations/todoist/client.ts')
  assert.match(code, /TODOIST_SCOPE = 'data:read'/)
  assert.doesNotMatch(code, /data:read_write|task:add/)
  assert.match(code, /\/api\/v1/)
  assert.match(code, /\/oauth\/authorize/)
  assert.match(code, /\/oauth\/access_token/)
  assert.match(code, /limit', '200'/)
  assert.match(code, /next_cursor/)
  assert.match(code, /refresh_token/)
})

test('Todoist credentials and OAuth state use encrypted server-only storage', () => {
  const server = read('app/lib/integrations/todoist/server.ts')
  const connect = read('app/api/integrations/todoist/connect/route.ts')
  const callback = read('app/api/integrations/todoist/callback/route.ts')
  assert.match(server, /createTodoistOAuthState/)
  assert.match(server, /timingSafeEqual/)
  assert.match(server, /OAUTH_MAX_AGE_MS/)
  assert.match(server, /encryptJson\(credentials\)/)
  assert.match(server, /integrationSyncDelta/)
  assert.match(server, /eq\('encrypted_credentials', JSON.stringify\(latest.encrypted_credentials\)\)/)
  assert.match(connect, /httpOnly: true/)
  assert.match(callback, /verifyTodoistOAuthState\(state, nonce\)/)
  assert.doesNotMatch(connect, /TODOIST_CLIENT_SECRET/)
})

test('Todoist sync stays per-user and frame selection is opt-in, with no new module', () => {
  const server = read('app/lib/integrations/todoist/server.ts')
  const frame = read('app/api/device/reminders/route.ts')
  const app = read('app/HomePageClient.tsx')
  const feed = read('app/lib/device/remindersFeed.ts')
  assert.match(server, /eq\('user_id', userId\)\.eq\('provider', TODOIST_PROVIDER\)/)
  assert.match(frame, /selectedIntegrations.todoist\?\.enabled === true/)
  assert.match(frame, /selectedIntegrations.todoist\?\.enabled !== true/)
  assert.match(frame, /buildTodoistReminderItems/)
  assert.match(app, /integrationProviderToReminderSource/)
  assert.match(app, /source === 'todoist'/)
  assert.match(app, /fetch\('\/api\/integrations\/todoist\/sync'/)
  assert.match(feed, /source: 'todoist' as const/)
  assert.doesNotMatch(read('app/lib/device/calendarVisibility.ts'), /source !== 'todoist'/)
})

test('Todoist Connect uses the existing catalog and disconnect flow', () => {
  const catalog = read('app/lib/integrations/catalog.ts')
  const disconnect = read('app/lib/integrations/disconnect.ts')
  const app = read('app/HomePageClient.tsx')
  assert.match(catalog, /key: 'todoist'[^\n]*status: 'available', connectable: true/)
  assert.match(disconnect, /'todoist'/)
  assert.match(app, /connectTodoist\(\)/)
  assert.match(app, /remind:todoist-oauth-device/)
  assert.match(app, /changeFrameIntegration\('todoist', \{ enabled: true \}\)/)
})

test('Todoist API v1 task requests follow cursors and never use write methods', async () => {
  const oldFetch = globalThis.fetch
  const requests = []
  try {
    globalThis.fetch = async (rawUrl, options) => {
      const url = new URL(String(rawUrl))
      requests.push(url)
      assert.equal(url.origin, 'https://api.todoist.com')
      assert.equal(url.pathname, '/api/v1/tasks')
      assert.equal(url.searchParams.get('limit'), '200')
      assert.equal(options?.headers?.Authorization, 'Bearer mock-token')
      assert.equal(options?.method, undefined, 'uses the GET default')
      const cursor = url.searchParams.get('cursor')
      return new Response(JSON.stringify(cursor
        ? { results: [{id:'task-b',content:'Second',due:{date:'2026-11-22'}}],next_cursor:null }
        : { results: [{id:'task-a',content:'First',due:{date:'2026-11-21'}}],next_cursor:'page-two' }
      ), {status:200,headers:{'Content-Type':'application/json'}})
    }
    const tasks = await fetchTodoistTasks('mock-token')
    assert.deepEqual(tasks.map(task=>task.id),['task-a','task-b'])
    assert.equal(requests.length,2)
    assert.equal(requests[1].searchParams.get('cursor'),'page-two')
  } finally {
    globalThis.fetch = oldFetch
  }
})

test('Todoist API errors do not delete or replace cached tasks', async () => {
  const oldFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), {status:401})
    await assert.rejects(fetchTodoistTasks('expired-token'), error => {
      assert.ok(error instanceof TodoistApiError)
      assert.equal(error.status,401)
      return true
    })
  } finally {
    globalThis.fetch = oldFetch
  }
  const server = read('app/lib/integrations/todoist/server.ts')
  assert.ok(server.indexOf('const tasks = await fetchTodoistTasks') < server.indexOf("const { data: existing, error }"),
    'upstream fetch must finish before any integration row mutation')
})
