import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260716120000_add_watch_onboarding_state.sql', import.meta.url), 'utf8')

test('Watch onboarding state remains durable after suggestions are removed from the focused composer', () => {
  assert.match(assistant, /\[, setHasCreatedWatch\] = useState<boolean \| null>\(null\)/)
  assert.match(assistant, /from\('user_onboarding_state'\)\.select\('has_created_watch'\)/)
  assert.match(assistant, /else \{\s+setHasCreatedWatch\(true\)\s+setRequest\(''\)/)
  assert.doesNotMatch(assistant, /c\.examples\.map/)
})

test('Watch creation records onboarding state transactionally and deletion cannot reset it', () => {
  assert.match(migration, /create table if not exists public\.user_onboarding_state/)
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/)
  assert.match(migration, /select distinct owner_user_id, true\s+from public\.monitoring_watches/)
  assert.match(migration, /insert into public\.monitoring_watches[\s\S]*insert into public\.user_onboarding_state/)
  assert.match(migration, /on conflict \(user_id\) do update\s+set has_created_watch = true/)
  assert.doesNotMatch(migration, /delete from public\.user_onboarding_state/)
  assert.doesNotMatch(migration, /has_created_watch = false/)
})

test('onboarding state can only be read by its authenticated owner', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /for select\s+to authenticated\s+using \(user_id = auth\.uid\(\)\)/)
  assert.match(migration, /grant select on public\.user_onboarding_state to authenticated/)
})
