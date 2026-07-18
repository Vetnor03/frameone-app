import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260716213000_complete_instant_watch_plans.sql', import.meta.url), 'utf8')
const create = migration.match(/function public\.create_ai_assistant_watch[\s\S]*?end \$\$;/)?.[0] ?? ''

test('backend creation RPC enforces plan-aware per-owner ongoing Watch limits race-safely', () => {
  assert.match(create, /pg_advisory_xact_lock\(hashtextextended\(current_user_id::text, 0\)\)/)
  assert.match(create, /mw\.owner_user_id=current_user_id and mw\.status in \('active','paused','error'\)/)
  assert.match(create, /owned_ongoing_watch_count >= e\.max_ongoing_watches/)
  assert.match(create, /raise exception 'watch_limit_reached'/)
  assert.match(create, /dm\.device_id=p_frame_id and dm\.user_id=current_user_id/)
})

test('backend excludes completed, deleted, and shared non-owner Watches from totals', () => {
  assert.doesNotMatch(create, /status in \([^)]*completed/)
  assert.doesNotMatch(create, /status in \([^)]*deleted/)
  assert.match(create, /owner_user_id=current_user_id/)
})

test('assistant UI counts owner ongoing Watches against canonical entitlements', () => {
  assert.match(assistant, /ONGOING_ASSISTANT_WATCH_STATUSES: AssistantWatchStatus\[\] = \['active', 'paused', 'error'\]/)
  assert.match(assistant, /w\.owner_user_id === currentUserId && ONGOING_ASSISTANT_WATCH_STATUSES\.includes\(w\.status\)/)
  assert.match(assistant, /ownedOngoingWatchCount >= entitlements\.max_ongoing_watches/)
  assert.doesNotMatch(assistant, /MAX_AI_ASSISTANT_WATCHES/)
})

test('assistant disables creation at or above limit without clearing typed text', () => {
  assert.match(assistant, /if \(reachedWatchLimit\) \{ if \(!entitlements\?\.monitoring_enabled\) setError\(c\.subscriptionRequired\); return \}/)
  assert.match(assistant, /const startFollowingDisabled = creating \|\| !requestIsValid \|\| reachedWatchLimit/)
  assert.match(assistant, /disabled=\{startFollowingDisabled\}/)
  const guard = assistant.indexOf('if (reachedWatchLimit)')
  const rpc = assistant.indexOf("rpc('create_ai_assistant_watch'")
  assert.ok(guard > -1 && rpc > guard)
  assert.doesNotMatch(assistant.slice(guard, rpc), /setRequest\(''\)/)
})

test('assistant localizes stable limit errors without logging request contents', () => {
  assert.match(assistant, /watch_limit_reached/)
  assert.match(assistant, /watch-limit-reached[\s\S]*?await loadAssistant\(\)/)
  assert.doesNotMatch(assistant, /setMessage\(c\.fullPlan\)/)
  assert.match(assistant, /console\.warn\('\[ai-assistant:watch-limit-reached\]'/)
  for (const line of assistant.split('\n').filter((line) => line.includes('console.'))) assert.doesNotMatch(line, /validation\.clean|request[,}]/)
})

test('shared Watch display is not sliced by an owner limit', () => {
  assert.match(assistant, /watches\.map\(\(w\)/)
  assert.doesNotMatch(assistant, /watches\.slice\(0,/)
})
