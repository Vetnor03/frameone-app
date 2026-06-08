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

test('Open-Meteo requests route through the shared cache with snapshot controls', () => {
  assert.match(route, /fetchCachedOpenMeteoJson\(\{[\s\S]*?dataType: 'surf'/)
  assert.match(route, /forceRefresh: opts\.forceRefresh \?\? ctx\.forceRefresh \?\? false/)
  assert.match(route, /configUpdatedAt: opts\.configUpdatedAt \?\? ctx\.configUpdatedAt \?\? null/)
  assert.doesNotMatch(route, /__openMeteoJsonCache/)
  assert.doesNotMatch(route, /openMeteoInFlight/)
})

test('Open-Meteo stale metadata remains available without route-local stale cache', () => {
  assert.match(route, /source: fetched\.debug\.staleUsed \? 'stale_cache' : 'live'/)
  assert.match(route, /cache_age_ms/)
  assert.match(route, /stale_expires_at/)
  assert.match(route, /marine_cache_debug/)
  assert.match(route, /weather_cache_debug/)
})

test('device bearer fallback skips scary malformed-JWT auth logs', () => {
  assert.match(route, /function bearerLooksLikeUserJwt/)
  assert.match(route, /Bearer is not user JWT, trying device auth fallback/)
  assert.match(route, /if \(bearerLooksLikeUserJwt\(bearer\)\) \{[\s\S]*?auth\.getUser\(\)/)
})
