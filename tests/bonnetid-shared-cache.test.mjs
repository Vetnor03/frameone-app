import test from 'node:test'
import assert from 'node:assert/strict'
import { withSharedIrnCache } from '../app/lib/integrations/bonnetid/sharedCacheCore.mjs'
import { readFileSync } from 'node:fs'

test('IRN cache hit never fetches upstream', async () => {
  const data = [{ date: '2026-11-20', name: 'Fajr' }]
  let fetched = 0
  const result = await withSharedIrnCache({
    key: 'irn:prayers:v1:NO1103:3:2026-11-20', ttlSeconds: 43200,
    claim: async () => ({ state: 'hit', payload: data }),
    publish: async () => { throw Error('unexpected publish') },
    fail: async () => { throw Error('unexpected fail') },
    load: async () => { fetched++; return [] },
  })
  assert.deepEqual(result, data)
  assert.equal(fetched, 0)
})

test('two simultaneous accounts sharing a city trigger only one provider fetch', async () => {
  let current = 'empty', fetches = 0, publishCount = 0
  const data = [{ date: '2026-11-20', name: 'Isha', time: '18:00' }]
  const claim = async () => {
    if (current === 'fresh') return { state: 'hit', payload: data }
    if (current === 'fetching') return { state: 'pending' }
    current = 'fetching'
    return { state: 'claimed', token: 'one-token' }
  }
  const publish = async () => { publishCount++; current = 'fresh'; return true }
  const fail = async () => { current = 'error'; return true }
  const load = async () => { fetches++; await Promise.resolve(); return data }
  const args = { key: 'irn:prayers:v1:NO1103:3:2026-11-20', ttlSeconds: 43200, claim, publish, fail, load, sleep: async () => { await Promise.resolve() } }
  const [one, two] = await Promise.all([withSharedIrnCache(args), withSharedIrnCache(args)])
  assert.deepEqual(one, data); assert.deepEqual(two, data)
  assert.equal(fetches, 1); assert.equal(publishCount, 1)
})

test('missing lease acquisition times out without upstream requests', async () => {
  let loads = 0
  await assert.rejects(withSharedIrnCache({
    key: 'irn:calendar:v1:2026-11-20', ttlSeconds: 86400,
    claim: async () => ({ state: 'pending' }),
    publish: async () => true, fail: async () => true,
    load: async () => { loads++; return [] },
    sleep: async () => {}, maxWaits: 2,
  }), /being refreshed/)
  assert.equal(loads, 0)
})

test('failed owner load creates cooldown rather than inviting another IRN request', async () => {
  let failed = false
  const args = {
    key: 'irn:locations:v1', ttlSeconds: 86400,
    claim: async () => failed ? ({ state: 'cooldown' }) : ({ state: 'claimed', token: 'one' }),
    publish: async () => true,
    fail: async () => { failed = true; return true },
    load: async () => { throw Error('Provider failure') },
  }
  await assert.rejects(withSharedIrnCache(args), /Provider failure/)
  await assert.rejects(withSharedIrnCache(args), /temporarily unavailable/)
})

test('provider credentials are only read server-side, and cache keys are shared', () => {
  const source = readFileSync(new URL('../app/lib/integrations/bonnetid/server.ts', import.meta.url), 'utf8')
  const wrapper = readFileSync(new URL('../app/lib/integrations/bonnetid/sharedCache.ts', import.meta.url), 'utf8')
  assert.match(source, /IRN_API_KEY/)
  assert.match(source, /sharedIrnCache\('irn:locations:v1'/)
  assert.match(source, /'irn:prayers:v1:' \+ city\.id \+ ':' \+ city\.prayerMethod \+ ':' \+ dates\[0\]/)
  assert.match(source, /sharedIrnCache\('irn:calendar:v1:' \+ today/)
  assert.doesNotMatch(wrapper, /NEXT_PUBLIC_|userId/)
})
