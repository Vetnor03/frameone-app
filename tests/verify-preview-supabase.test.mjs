import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyPreviewSupabaseCredentials } from '../scripts/verify-preview-supabase.mjs'

const ref = 'ouwhfzjaahdipwmelzvf'
const url = `https://${ref}.supabase.co`
const env = {
  VERCEL_ENV: 'preview',
  REMIND_STAGING_SUPABASE_REF: ref,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-staging-public',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-staging-server',
}

test('local and production builds do not contact staging', async () => {
  const noFetch = () => { throw new Error('Should never reach network') }
  assert.deepEqual(await verifyPreviewSupabaseCredentials({ ...env, VERCEL_ENV: 'production' }, noFetch), { skipped: true })
  assert.deepEqual(await verifyPreviewSupabaseCredentials({ ...env, VERCEL_ENV: undefined }, noFetch), { skipped: true })
})

test('preview validates both public and server keys against the pinned project', async () => {
  const calls = []
  const fakeFetch = async (target, options) => {
    calls.push({ target, options })
    return { ok: true, status: 200 }
  }
  assert.deepEqual(await verifyPreviewSupabaseCredentials(env, fakeFetch), { verified: true })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].target, `${url}/auth/v1/settings`)
  assert.equal(calls[0].options.headers.apikey, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  assert.equal(calls[1].target, `${url}/auth/v1/admin/users?page=1&per_page=1`)
  assert.equal(calls[1].options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY)
  assert.equal(calls[1].options.method, 'GET')
  assert.equal(calls[1].options.cache, 'no-store')
})

test('preview rejects missing or wrong staging configuration before fetch', async () => {
  const noFetch = () => { throw new Error('Should never reach network') }
  await assert.rejects(verifyPreviewSupabaseCredentials({ ...env, REMIND_STAGING_SUPABASE_REF: 'bzkqyllgccswrfudmexm' }, noFetch), /wrong staging project/)
  await assert.rejects(verifyPreviewSupabaseCredentials({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https:\/\/bzkqyllgccswrfudmexm.supabase.co' }, noFetch), /wrong staging project/)
  await assert.rejects(verifyPreviewSupabaseCredentials({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, noFetch), /keys missing/)
  await assert.rejects(verifyPreviewSupabaseCredentials({ ...env, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, noFetch), /keys missing/)
})

test('preview aborts when either key is rejected or endpoint is unavailable', async () => {
  await assert.rejects(
    verifyPreviewSupabaseCredentials(env, async () => ({ ok: false, status: 401 })),
    /public key was not accepted/,
  )
  let call = 0
  await assert.rejects(
    verifyPreviewSupabaseCredentials(env, async () => {
      call++
      return call === 1 ? { ok: true, status: 200 } : { ok: false, status: 403 }
    }),
    /server key was not accepted/,
  )
  await assert.rejects(verifyPreviewSupabaseCredentials(env, async () => { throw new Error('Network down') }), /verification unavailable/)
})
