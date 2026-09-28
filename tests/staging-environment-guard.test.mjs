import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Exercise the exact JavaScript guard embedded in next.config.ts, without
// requiring a live deployment, production credentials or a Supabase project.
const source = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
const start = source.indexOf('const liveProductionProjectId = "prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0";')
const end = source.indexOf('\n}\n\nconst nextConfig', start)
assert.ok(start >= 0 && end > start, 'preview build guard must exist')

const guard = new Function('process', source.slice(start, end + 2))
const stagingRef = 'ouwhfzjaahdipwmelzvf'
const staging = {
  VERCEL_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR',
  REMIND_STAGING_VERCEL_PROJECT_ID: 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR',
  VERCEL_GIT_COMMIT_REF: 'development',
  REMIND_STAGING_SUPABASE_REF: stagingRef,
  NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-test-publishable-key',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-service-key',
}

function check(overrides = {}) {
  return guard({ env: { ...staging, ...overrides } })
}

test('existing main production and local builds remain unaffected', () => {
  assert.doesNotThrow(() => check({ VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0', VERCEL_GIT_COMMIT_REF: 'main', REMIND_STAGING_SUPABASE_REF: undefined }))
  assert.doesNotThrow(() => check({ VERCEL_ENV: undefined, REMIND_STAGING_SUPABASE_REF: undefined }))
})

test('preview fails closed before staging is configured', () => {
  assert.throws(() => check({ REMIND_STAGING_SUPABASE_REF: undefined }), /Staging deployment blocked/)
  assert.throws(() => check({ REMIND_STAGING_SUPABASE_REF: 'bzkqyllgccswrfudmexm', NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/bzkqyllgccswrfudmexm.supabase.co' }), /Staging deployment blocked/)
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/bzkqyllgccswrfudmexm.supabase.co' }), /Staging deployment blocked/)
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_URL: undefined }), /Staging deployment blocked/)
  assert.throws(() => check({ REMIND_STAGING_SUPABASE_REF: 'abcdefghijklmnopqrst', NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }), /Staging deployment blocked/)
})

test('preview requires both app and server credentials', () => {
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }), /Staging deployment blocked/)
  assert.throws(() => check({ SUPABASE_SERVICE_ROLE_KEY: undefined }), /Staging deployment blocked/)
})

test('preview accepts only the exact configured staging project URL', () => {
  assert.doesNotThrow(() => check())
  assert.doesNotThrow(() => check({ NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co/` }))
  assert.throws(() => check({ NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/example.supabase.co' }), /Staging deployment blocked/)
})


test('preview blocks independent or direct production database connections', () => {
  assert.doesNotThrow(() => check({ SUPABASE_URL: `https://${stagingRef}.supabase.co/` }))
  assert.throws(() => check({ SUPABASE_URL: 'https://bzkqyllgccswrfudmexm.supabase.co' }), /Staging deployment blocked/)
  for (const name of ['DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL']) {
    assert.throws(() => check({ [name]: 'postgres://synthetic-test-credentials@localhost/test' }), /Staging deployment blocked/)
  }
})

test('preview cannot inherit live third-party credentials that send emails or run jobs', () => {
  const prohibited = [
    'RESEND_API_KEY', 'CRON_SECRET', 'MINRENOVASJON_APP_KEY',
    'MICROSOFT_CLIENT_SECRET', 'INTEGRATION_CREDENTIALS_KEY',
    'SPOND_CREDENTIALS_KEY', 'OPENAI_API_KEY', 'VAPID_PRIVATE_KEY',
    'WEB_PUSH_PRIVATE_KEY', 'SHOPIFY_ADMIN_ACCESS_TOKEN',
    'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  ]
  for (const name of prohibited) {
    assert.throws(() => check({ [name]: 'synthetic-test-value' }), /Staging deployment blocked/)
  }
})

test('dedicated staging project checks staging credentials even when Vercel calls it production', () => {
  assert.doesNotThrow(() => check({ VERCEL_ENV: 'production' }))
  assert.throws(() => check({ VERCEL_ENV: 'production', REMIND_STAGING_SUPABASE_REF: undefined }), /Staging deployment blocked/)
  assert.throws(() => check({ VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/bzkqyllgccswrfudmexm.supabase.co' }), /Staging deployment blocked/)
  assert.throws(() => check({ VERCEL_ENV: 'production', OPENAI_API_KEY: 'synthetic-production-key' }), /Staging deployment blocked/)
})

test('both staging targets reject original production project and unapproved project IDs', () => {
  assert.throws(() => check({ VERCEL_PROJECT_ID: 'prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0' }), /Staging deployment blocked/)
  assert.throws(() => check({ REMIND_STAGING_VERCEL_PROJECT_ID: undefined }), /Staging deployment blocked/)
  assert.throws(() => check({ VERCEL_PROJECT_ID: 'prj_some_other_project' }), /Staging deployment blocked/)
  assert.throws(() => check({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }), /Staging deployment blocked/)
})

test('staging rejects an unapproved project even when its matching ID was set in both env variables', () => {
  assert.throws(() => check({
    VERCEL_PROJECT_ID: 'prj_wrong_project',
    REMIND_STAGING_VERCEL_PROJECT_ID: 'prj_wrong_project',
  }), /Staging deployment blocked/)
  assert.throws(() => check({
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_ID: 'prj_wrong_project',
    REMIND_STAGING_VERCEL_PROJECT_ID: 'prj_wrong_project',
  }), /Staging deployment blocked/)
})
