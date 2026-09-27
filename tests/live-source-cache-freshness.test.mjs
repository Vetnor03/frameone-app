import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { newsCacheDecision, NEWS_UPSTREAM_REFRESH_MS, NEWS_MAX_STALE_MS, NEWS_ERROR_RETRY_MS } from '../app/lib/news/cachePolicy.ts'
import { collectVisibleContent } from '../app/lib/device/contentSignatureBase.mjs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const NOW = Date.parse('2026-09-27T08:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()

test('News returns current snapshots without re-requesting the RSS feed', () => {
  assert.equal(NEWS_UPSTREAM_REFRESH_MS, 15 * 60_000)
  const decision = newsCacheDecision({ now: NOW, refreshedAt: ago(10 * 60_000), checkedAt: ago(10 * 60_000), hasItems: true })
  assert.equal(decision.fresh, true)
  assert.equal(decision.usableStale, true)
})

test('expired News cache revalidates; transient failures back off and preserve only bounded stale data', () => {
  assert.equal(NEWS_ERROR_RETRY_MS, 5 * 60_000)
  const stillSafe = newsCacheDecision({ now: NOW, refreshedAt: ago(35 * 60_000), checkedAt: ago(2 * 60_000), hasItems: true })
  assert.equal(stillSafe.fresh, false)
  assert.equal(stillSafe.usableStale, true)
  assert.equal(stillSafe.retryAllowed, false)
  const due = newsCacheDecision({ now: NOW, refreshedAt: ago(35 * 60_000), checkedAt: ago(6 * 60_000), hasItems: true })
  assert.equal(due.retryAllowed, true)
  assert.equal(NEWS_MAX_STALE_MS, 2 * 60 * 60_000)
  const expired = newsCacheDecision({ now: NOW, refreshedAt: ago(NEWS_MAX_STALE_MS + 1), checkedAt: ago(1 * 60_000), hasItems: true })
  assert.equal(expired.usableStale, false)
  assert.equal(expired.retryAllowed, false)
})

test('News cache error backoff is also effective with no successful snapshot; invalid timestamps do not become fresh', () => {
  const noSnapshot = newsCacheDecision({ now: NOW, refreshedAt: null, checkedAt: ago(60_000), hasItems: false })
  assert.equal(noSnapshot.usableStale, false)
  assert.equal(noSnapshot.retryAllowed, false)
  const invalid = newsCacheDecision({ now: NOW, refreshedAt: 'invalid', checkedAt: null, hasItems: true })
  assert.equal(invalid.fresh, false)
  assert.equal(invalid.usableStale, false)
  assert.equal(invalid.retryAllowed, true)
})

test('News upstream failure is contained and an unrelated active module still completes', async () => {
  const settings = { cells: [
    { slot: 0, module: 'news', size: 'SMALL', w: 800, h: 120 },
    { slot: 1, module: 'countdown', size: 'MEDIUM', w: 400, h: 240 },
  ], modules: {} }
  const seen = []
  const visible = await collectVisibleContent({
    settings,
    deviceId: 'test-frame',
    origin: 'https://re-mind.no',
    authorization: 'Bearer test',
    now: NOW,
    fetchImpl: async (input) => {
      const pathname = new URL(input).pathname
      seen.push(pathname)
      if (pathname === '/api/news') return new Response('NRK RSS 403', { status: 502 })
      if (pathname === '/api/device/countdowns') return new Response(JSON.stringify({ items: [{ title: 'Tomorrow' }] }), { status: 200 })
      throw new Error('Unexpected source ' + pathname)
    },
  })
  assert.deepEqual(seen.sort(), ['/api/device/countdowns', '/api/news'])
  assert.deepEqual(visible.sources.news, { ok: false, items: [] })
  assert.equal(visible.sources.countdown.items[0].title, 'Tomorrow')
})

test('News has a durable service-only cache; upstream failure does not block render-state', () => {
  const api = read('app/api/news/route.ts')
  const migration = read('supabase/migrations/20260927063000_add_bounded_news_feed_cache.sql')
  const renderer = read('app/lib/device/contentSignatureBase.mjs')
  assert.match(migration, /create table if not exists public\.news_feed_cache/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.news_feed_cache from anon, authenticated/)
  assert.match(api, /cache: 'no-store'/)
  assert.match(api, /newsCacheDecision/)
  assert.match(api, /if \(!decision\.retryAllowed\) return fallback\(\)/)
  assert.match(api, /ignoreDuplicates: true/)
  assert.match(api, /if \(!snapshot\.available\) return NextResponse\.json/)
  assert.doesNotMatch(api, /status: 502/)
  assert.match(renderer, /sources\.news = \{ ok: false, items: \[\] \}/)
  assert.match(renderer, /NEWS_POWER_SAVE_FRESHNESS_MS = 60 \* 60_000/)
})

test('existing time-sensitive module caches remain bounded instead of treating a cache hit as permanent', () => {
  const forecast = read('app/lib/server/forecastCache.ts')
  const surf = read('app/api/device/surf-frame/route.ts')
  const ski = read('app/api/ski/summary/route.ts')
  const stocks = read('app/api/device/stocks/route.ts')
  const soccer = read('app/api/soccer/frame/route.ts')
  assert.match(forecast, /cachedAgeMs < FOUR_HOURS_MS/)
  assert.match(forecast, /staleAgeMs < FOUR_HOURS_MS/)
  assert.match(surf, /const sourceRefreshDue = ageMs >= SURF_FRAME_RESULT_MIN_REFRESH_MS/)
  assert.match(ski, /next: \{ revalidate: 600 \}/)
  assert.match(stocks, /cache: 'no-store'/)
  assert.match(soccer, /const SOCCER_DATA_REVALIDATE_SECONDS = 5 \* 60/)
  assert.match(soccer, /const SOCCER_STALE_SECONDS = 60 \* 60/)
  assert.doesNotMatch(soccer, /SOCCER_STALE_SECONDS = 24 \* 60 \* 60/)
})
