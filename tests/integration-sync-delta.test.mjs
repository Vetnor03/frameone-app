import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { changedIntegrationRows, integrationSyncDelta } from '../app/lib/integrations/integrationSyncDelta.ts'

const sample = (overrides = {}) => ({
  user_id: 'user-1',
  provider: 'teams',
  external_id: 'meeting-1',
  title: 'Dagligbank',
  body: null,
  starts_at: '2026-10-14T12:00:00.000Z',
  due_at: '2026-10-14T13:00:00.000Z',
  priority: 0,
  raw: { details: { platform: 'teams', online: true }, links: ['a', 'b'] },
  updated_at: '2026-10-14T19:00:00Z',
  ...overrides,
})

test('unchanged provider events do not trigger any integration_items writes', () => {
  const stored = sample({
    starts_at: '2026-10-14T12:00:00+00:00',
    due_at: '2026-10-14T13:00:00+00:00',
    updated_at: '2026-10-14T12:00:00Z',
    raw: { links: ['a', 'b'], details: { online: true, platform: 'teams' } },
  })
  assert.deepEqual(integrationSyncDelta([sample()], [stored]), { changed: [], obsoleteIds: [] })
})

test('new, modified, and removed items produce minimal updates', () => {
  const before = [sample({ external_id: 'old' }), sample({ external_id: 'meeting-1' })]
  const after = [sample({ title: 'Dagligbank — new location' }), sample({ external_id: 'new' })]
  const { changed, obsoleteIds } = integrationSyncDelta(after, before)
  assert.deepEqual(changed.map(x => x.external_id), ['meeting-1', 'new'])
  assert.deepEqual(obsoleteIds, ['old'])
})

test('a complete empty sync only identifies existing rows as obsolete', () => {
  assert.deepEqual(integrationSyncDelta([], [sample()]), { changed: [], obsoleteIds: ['meeting-1'] })
  assert.deepEqual(integrationSyncDelta([], []), { changed: [], obsoleteIds: [] })
})

test('retaining a scheduled event while updating provider-only metadata works', () => {
  const old = sample({ raw: { data: { status: 'draft' } } })
  const changed = sample({ raw: { data: { status: 'confirmed' } } })
  assert.equal(changedIntegrationRows([changed], [old]).length, 1)
  assert.equal(changedIntegrationRows([changed], [changed]).length, 0)
})

test('Teams, Spond and Local Events sync must avoid unconditional delete/reinsert and blind upserts', () => {
  // Outlook commits the same minimal delta in one revision-guarded transaction.
  const teams = readFileSync(new URL('../app/lib/integrations/teams/server.ts', import.meta.url), 'utf8')
  const sql = readFileSync(new URL('../supabase/manual/outlook_calendar_atomic_sync.sql', import.meta.url), 'utf8')
  assert.match(teams, /integrationSyncDelta\(rows, existing\)/)
  assert.match(teams, /rpc\('commit_outlook_calendar_sync',\s*\{[\s\S]*?p_changed: changed,\s*p_obsolete_ids: obsoleteIds,/)
  assert.match(sql, /delete from public\.integration_items\s+where user_id = p_user_id and provider = 'teams' and external_id = any\(p_obsolete_ids\)/i)
  assert.match(sql, /insert into public\.integration_items[\s\S]*?jsonb_to_recordset\(p_changed\)[\s\S]*?on conflict \(user_id, provider, external_id\) do update/i)
  assert.doesNotMatch(teams, /\.delete\(\)\s*\.eq\('user_id', userId\)\s*\.eq\('provider', TEAMS_PROVIDER\)/)
  const spond = readFileSync(new URL('../app/lib/integrations/spond/server.ts', import.meta.url), 'utf8')
  assert.match(spond, /integrationSyncDelta\(rows, existing \|\| \[\]\)/)
  assert.match(spond, /\.in\('external_id', obsoleteIds\.slice\(/)
  assert.match(spond, /\.upsert\(changed\.slice\(/)
  assert.doesNotMatch(spond, /\.delete\(\)\s*\.eq\('user_id', userId\)\s*\.eq\('provider', SPOND_PROVIDER\)\s*;/)
  const code = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.match(code, /changedIntegrationRows\(rows, previouslyStored \|\| \[\]\)/)
  assert.match(code, /\.upsert\(changed\.slice\(/)
  assert.match(code, /successfulSources\.has\(source\)/)
})
