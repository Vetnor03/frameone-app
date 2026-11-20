import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { normalizeTodoistTask } from '../app/lib/integrations/todoist/normalize.mjs'

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
  assert.match(catalog, /key: 'todoist'[^\n]*status: 'experimental', connectable: true/)
  assert.match(disconnect, /'todoist'/)
  assert.match(app, /connectTodoist\(\)/)
  assert.match(app, /remind:todoist-oauth-device/)
  assert.match(app, /changeFrameIntegration\('todoist', \{ enabled: true \}\)/)
})
