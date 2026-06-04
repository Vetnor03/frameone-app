import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/surf/score/route.ts', import.meta.url), 'utf8')

test('Open-Meteo forecast 429/timeout can fall back while marine data remains usable', () => {
  assert.match(route, /if \(!marineFetched\.data\) throw new Error/)
  assert.match(route, /const windUnavailable = !windFetched\.data/)
  assert.match(route, /windFetched\.error/)
  assert.match(route, /mt\.map\(\(\) => 0\)/)
  assert.doesNotMatch(route, /if \(!windFetched\.data\) throw new Error/)
})

test('one Today’s Best spot failure is isolated from other candidate scores', () => {
  assert.match(route, /mapWithConcurrency\(candidates, CONCURRENCY, async \(s\) => \{[\s\S]*?catch \{[\s\S]*?return \{ ok: false as const \}/)
  assert.match(route, /const results = settled\.filter\(\(x: any\) => x && x\.ok\)/)
})

test('Open-Meteo requests are deduped and nearby grid points share a bounded per-request cache key', () => {
  assert.match(route, /openMeteoInFlight: Map<string, Promise<OpenMeteoFetchResult<any>>>/)
  assert.match(route, /ctx\.openMeteoInFlight\.get\(key\)/)
  assert.match(route, /OPEN_METEO_COORD_BUCKET_DEGREES = 0\.05/)
  assert.match(route, /Math\.round\(n \/ OPEN_METEO_COORD_BUCKET_DEGREES\) \* OPEN_METEO_COORD_BUCKET_DEGREES/)
  assert.match(route, /ctx\.openMeteoInFlight\.set\(key, p\)/)
})

test('global Open-Meteo stale cache is bounded and cannot serve very old data silently', () => {
  assert.match(route, /OPEN_METEO_CACHE_MAX_ENTRIES = 200/)
  assert.match(route, /OPEN_METEO_STALE_CACHE_TTL_MS = 2 \* 60 \* 60 \* 1000/)
  assert.match(route, /function pruneOpenMeteoCache/)
  assert.match(route, /__openMeteoJsonCache\.size > OPEN_METEO_CACHE_MAX_ENTRIES/)
  assert.match(route, /entry\.staleExp <= now/)
  assert.match(route, /source: 'stale_cache'/)
  assert.match(route, /cache_age_ms/)
  assert.match(route, /stale_expires_at/)
})

test('device bearer fallback skips scary malformed-JWT auth logs', () => {
  assert.match(route, /function bearerLooksLikeUserJwt/)
  assert.match(route, /Bearer is not user JWT, trying device auth fallback/)
  assert.match(route, /if \(bearerLooksLikeUserJwt\(bearer\)\) \{[\s\S]*?auth\.getUser\(\)/)
})
