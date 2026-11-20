import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  fetchGoogleTaskListsAndTasks,
  googleTasksAuthUrl,
} from '../app/lib/integrations/google-tasks/client.ts'

test('Google Tasks requests only read-only OAuth with PKCE and offline access', () => {
  const keys = ['GOOGLE_TASKS_CLIENT_ID', 'GOOGLE_TASKS_CLIENT_SECRET', 'GOOGLE_TASKS_REDIRECT_URI']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  try {
    process.env.GOOGLE_TASKS_CLIENT_ID = 'test-google-tasks-client'
    process.env.GOOGLE_TASKS_CLIENT_SECRET = 'test-secret'
    process.env.GOOGLE_TASKS_REDIRECT_URI = 'https://re-mind.no/api/integrations/google-tasks/callback'
    const url = new URL(googleTasksAuthUrl('opaque-state', 'pkce-challenge'))
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/tasks.readonly')
    assert.equal(url.searchParams.get('access_type'), 'offline')
    assert.equal(url.searchParams.get('prompt'), 'consent select_account')
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(url.searchParams.get('code_challenge'), 'pkce-challenge')
    assert.equal(url.searchParams.get('state'), 'opaque-state')
    assert.equal(url.searchParams.get('redirect_uri'), process.env.GOOGLE_TASKS_REDIRECT_URI)
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
})

test('Google Tasks imports paginated task lists and only dated unfinished tasks', async () => {
  const previousFetch = globalThis.fetch
  const requested = []
  try {
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input))
      requested.push(url)
      assert.equal(url.hostname, 'tasks.googleapis.com')
      assert.equal(options?.headers?.Authorization, 'Bearer test-access-token')
      if (url.pathname.endsWith('/users/@me/lists')) {
        return Response.json(url.searchParams.has('pageToken')
          ? { items: [{ id: 'second-list' }] }
          : { items: [{ id: 'first-list' }], nextPageToken: 'more-lists' })
      }
      if (url.pathname.endsWith('/first-list/tasks')) {
        return Response.json(url.searchParams.has('pageToken')
          ? { items: [
              { id: 'complete', title: 'Done', status: 'completed', due: '2026-11-22T00:00:00Z' },
              { id: 'undated', title: 'No date' },
              { id: 'deleted', title: 'Deleted', deleted: true, due: '2026-11-22T00:00:00Z' },
            ] }
          : { items: [{ id: 'one', title: 'Bring packages', due: '2026-11-21T00:00:00Z' }], nextPageToken: 'more-tasks' })
      }
      if (url.pathname.endsWith('/second-list/tasks')) {
        return Response.json({ items: [{ id: 'one', title: 'Call supplier', due: '2026-11-22T00:00:00Z' }] })
      }
      throw new Error('Unexpected endpoint: ' + url.pathname)
    }
    const tasks = await fetchGoogleTaskListsAndTasks('test-access-token')
    assert.deepEqual(tasks.map(t => t.external_id), ['first-list:one', 'second-list:one'])
    assert.deepEqual(tasks.map(t => t.raw.date), ['2026-11-21', '2026-11-22'])
    assert.ok(tasks.every(t => t.raw.all_day === true))
    assert.ok(requested.some(u => u.searchParams.get('pageToken') === 'more-lists'))
    assert.ok(requested.some(u => u.searchParams.get('pageToken') === 'more-tasks'))
    assert.ok(requested.filter(u => u.pathname.endsWith('/tasks')).every(u =>
      u.searchParams.get('showCompleted') === 'false' &&
      u.searchParams.get('showDeleted') === 'false' &&
      u.searchParams.get('showHidden') === 'false'
    ))
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('Google Tasks rejects an incomplete upstream page rather than silently losing tasks', async () => {
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/users/@me/lists')) return Response.json({ items: [{ id: 'first' }] })
      return Response.json({ error: 'upstream unavailable' }, { status: 503 })
    }
    await assert.rejects(fetchGoogleTaskListsAndTasks('token'), /Google Tasks API failed \(503\)/)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('Google Tasks is wired into Connect, phone Reminders and physical frame', () => {
  const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const frame = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const catalogue = readFileSync(new URL('../app/lib/integrations/catalog.ts', import.meta.url), 'utf8')
  assert.match(catalogue, /key: 'google-tasks'/)
  assert.match(app, /\/api\/integrations\/google-tasks\/connect/)
  assert.match(app, /\/api\/integrations\/google-tasks\/sync/)
  assert.match(frame, /buildGoogleTasksReminderItems/)
  assert.match(frame, /syncGoogleTasksFromStoredConnection/)
})
