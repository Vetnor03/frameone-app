import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Exercise the exact JavaScript guard embedded in next.config.ts, without
// requiring a live deployment, production credentials or a Supabase project.
const source = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
const start = source.indexOf('if (process.env.VERCEL_ENV === "preview") {')
const end = source.indexOf('\n}\n\nconst nextConfig', start)
assert.ok(start >= 0 && end > start, 'preview build guard must exist')

const guard = new Function('process', source.slice(start, end + 2))
const stagingRef = 'abcdefghijklmnopqrst'
const staging = {
  VERCEL_ENV: 'preview',
  REMIND_STAGING_SUPABASE_REF: stagingRef,
  NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-test-publishable-key',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-service-key',
}

function check(overrides = {}) {
  return guard({ env: { ...staging, ...overrides } })
}

test('production and local builds are not changed by preview gate', () => {
  assert.doesNotThrow(() => check({ VERCEL_ENV: 'production', REMIND_STAGING_SUPABASE_REF: undefined }))
  assert.doesNotThrow(() => check({ VERCEL_ENV: undefined, REMIND_STAGING_SUPABASE_REF: undefined }))
})

test('preview fails closed before staging is configured', () => {
  assert.throws(() => check({ REMIND_STAGING_SUPABASE_REF: undefined }), /Preview deployment blocked/)
  assert.throws(() => check({ REMIND_STAGING_SUPABASE_REF: 'bzkqyllgccswrfudmexm', NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/bzkqyllgccswrfudmexm.supabase.co' }), /Preview deployment blocked/)
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/bzkqyllgccswrfudmexm.supabase.co' }), /Preview deployment blocked/)
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_URL: undefined }), /Preview deployment blocked/)
})

test('preview requires both app and server credentials', () => {
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }), /Preview deployment blocked/)
  assert.throws(() => check({ SUPABASE_SERVICE_ROLE_KEY: undefined }), /Preview deployment blocked/)
})

test('preview accepts only the exact configured staging project URL', () => {
  assert.doesNotThrow(() => check())
  assert.doesNotThrow(() => check({ NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co/` }))
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/example.supabase.co' }), /Preview deployment blocked/)
})
