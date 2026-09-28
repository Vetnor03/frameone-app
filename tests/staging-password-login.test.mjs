import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const login = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8')
const stagingUrl = 'https://ouwhfzjaahdipwmelzvf.supabase.co'

test('staging password UI is pinned to the isolated Supabase project, not Vercel environment label', () => {
  assert.match(login, /const STAGING_TEST_URL = 'https:\/\/ouwhfzjaahdipwmelzvf\.supabase\.co'/)
  assert.match(login, /const isStagingTestLogin = process\.env\.NEXT_PUBLIC_SUPABASE_URL === STAGING_TEST_URL/)
  assert.match(login, /\{isStagingTestLogin \? \(/)
  assert.match(login, /\) : step === 'email' \? \(/)
})

test('two fixed synthetic identities use actual Supabase password auth and sessions', () => {
  assert.match(login, /tester-a@re-mind\.test/)
  assert.match(login, /tester-b@re-mind\.test/)
  assert.match(login, /supabase\.auth\.signInWithPassword\(\{/)
  assert.match(login, /email: testAccounts\[testAccount\]\.email/)
  assert.match(login, /password: testPassword/)
  assert.match(login, /router\.replace\(nextPath\)/)
  assert.match(login, /router\.refresh\(\)/)
})

test('staging tester switching is opt-in and normal customer OTP remains present', () => {
  assert.match(login, /window\.location\.search\)\.get\('tester'\) === '1'/)
  assert.match(login, /data\.session && !switchingTester/)
  assert.match(login, /type="password"/)
  assert.match(login, /\/login\?tester=1/)
  assert.match(login, /fetch\('\/api\/auth\/request-code'/)
  assert.match(login, /fetch\('\/api\/auth\/verify-code'/)
})

test('staging password shortcut cannot provision users or embed credentials', () => {
  assert.doesNotMatch(login, /auth\.admin\./)
  assert.doesNotMatch(login, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(login, /(?:password|secret):\s*['"][^'"]+['"]/i)
})
