import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __resetForecastCacheForTests,
  __seedForecastCacheForTests,
  fetchCachedForecastJson,
  forecastCacheKey,
  forecastCacheTtlMs,
} from '../app/lib/server/forecastCache.ts'

function okJson(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}

const weatherOptions = (fetcher, overrides = {}) => ({
  dataType: 'weather',
  provider: 'open-meteo',
  url: 'https://api.open-meteo.com/v1/forecast?longitude=5.3221&latitude=60.3929&current=temperature_2m,weather_code&hourly=temperature_2m&daily=weather_code&forecast_days=5&timezone=auto',
  timeoutMs: 1000,
  forecastDays: 5,
  forecastRange: '0-5d',
  timezone: 'auto',
  frameRequest: true,
  allowStale: true,
  fetcher,
  ...overrides,
})

const surfOptions = (fetcher, overrides = {}) => ({
  dataType: 'surf',
  provider: 'open-meteo',
  url: 'https://marine-api.open-meteo.com/v1/marine?longitude=5.3221&latitude=60.3929&hourly=wave_height,wave_direction,wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period&timezone=UTC&cell_selection=sea',
  timeoutMs: 1000,
  horizonHours: 48,
  forecastRange: '0-48h',
  timezone: 'UTC',
  frameRequest: true,
  allowStale: true,
  fetcher,
  ...overrides,
})

test('identical weather requests only call external fetch once within TTL', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson({ current: { temperature_2m: 8 + calls } })
  }

  const first = await fetchCachedForecastJson(weatherOptions(fetcher))
  const second = await fetchCachedForecastJson(weatherOptions(fetcher))

  assert.equal(calls, 1)
  assert.equal(first.payload.current.temperature_2m, 9)
  assert.equal(second.payload.current.temperature_2m, 9)
  assert.equal(second.debug.openMeteoCacheStatus, 'hit')
  assert.equal(second.debug.externalFetch, false)
})

test('identical surf/marine requests only call external fetch once within TTL', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson({ hourly: { wave_height: [calls], wave_period: [10], wave_direction: [270] } })
  }

  const first = await fetchCachedForecastJson(surfOptions(fetcher))
  const second = await fetchCachedForecastJson(surfOptions(fetcher))

  assert.equal(calls, 1)
  assert.deepEqual(first.payload.hourly.wave_height, [1])
  assert.deepEqual(second.payload.hourly.wave_height, [1])
  assert.equal(second.debug.openMeteoCacheStatus, 'hit')
})

test('concurrent identical requests de-duplicate to one external fetch', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  let release
  const blocker = new Promise((resolve) => { release = resolve })
  const fetcher = async () => {
    calls += 1
    await blocker
    return okJson({ marker: calls })
  }

  const opts = weatherOptions(fetcher)
  const firstPromise = fetchCachedForecastJson(opts)
  const secondPromise = fetchCachedForecastJson(opts)
  release()
  const [first, second] = await Promise.all([firstPromise, secondPromise])

  assert.equal(calls, 1)
  assert.equal(first.payload.marker, 1)
  assert.equal(second.payload.marker, 1)
  assert.equal(second.debug.openMeteoCacheStatus, 'deduped')
  assert.equal(second.debug.inFlightDeduped, true)
})

test('different lat/lon or query params produce different cache keys while param order is stable', () => {
  const base = weatherOptions(fetch).url
  const reordered = 'https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=5&daily=weather_code&hourly=temperature_2m&current=weather_code,temperature_2m&latitude=60.3929&longitude=5.3221'
  const differentLat = base.replace('latitude=60.3929', 'latitude=60.4929')
  const differentHourly = base.replace('hourly=temperature_2m', 'hourly=temperature_2m,wind_speed_10m')

  const keyBase = forecastCacheKey(weatherOptions(fetch))
  assert.equal(keyBase, forecastCacheKey(weatherOptions(fetch, { url: reordered })))
  assert.notEqual(keyBase, forecastCacheKey(weatherOptions(fetch, { url: differentLat })))
  assert.notEqual(keyBase, forecastCacheKey(weatherOptions(fetch, { url: differentHourly })))
})

test('forceRefresh bypasses cache', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson({ marker: calls })
  }
  const opts = weatherOptions(fetcher)
  await fetchCachedForecastJson(opts)
  const refreshed = await fetchCachedForecastJson(weatherOptions(fetcher, { forceRefresh: true }))

  assert.equal(calls, 2)
  assert.equal(refreshed.payload.marker, 2)
  assert.equal(refreshed.debug.forceRefresh, true)
  assert.equal(refreshed.debug.openMeteoCacheStatus, 'bypassed')
})

test('stale entries older than 4 hours are not used', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return new Response('rate limited', { status: 429 })
  }
  const opts = surfOptions(fetcher)
  __seedForecastCacheForTests(opts, { stale: true }, Date.now() - (4 * 60 * 60 * 1000 + 1), 1, 8 * 60 * 60 * 1000)

  const result = await fetchCachedForecastJson(opts)

  assert.equal(calls, 1)
  assert.equal(result.payload, null)
  assert.equal(result.debug.staleUsed, false)
  assert.equal(result.error, '429')
})

test('frame snapshot can reuse unchanged config data up to 4 hours', async () => {
  __resetForecastCacheForTests()
  const fetchedAt = Date.now() - 2 * 60 * 60 * 1000
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson({ marker: 'new' })
  }
  const opts = weatherOptions(fetcher, { configUpdatedAt: new Date(fetchedAt - 1000).toISOString() })
  __seedForecastCacheForTests(opts, { marker: 'old' }, fetchedAt, 15 * 60 * 1000, 4 * 60 * 60 * 1000)

  const result = await fetchCachedForecastJson(opts)

  assert.equal(calls, 0)
  assert.equal(result.payload.marker, 'old')
  assert.equal(result.debug.openMeteoCacheTtlMs, 4 * 60 * 60 * 1000)
})

test('config changes after cached fetch keep normal 15 minute TTL', async () => {
  __resetForecastCacheForTests()
  const fetchedAt = Date.now() - 20 * 60 * 1000
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson({ marker: 'new' })
  }
  const opts = weatherOptions(fetcher, { configUpdatedAt: new Date(fetchedAt + 1000).toISOString() })
  __seedForecastCacheForTests(opts, { marker: 'old' }, fetchedAt, 15 * 60 * 1000, 4 * 60 * 60 * 1000)

  const result = await fetchCachedForecastJson(opts)

  assert.equal(calls, 1)
  assert.equal(result.payload.marker, 'new')
})

test('surf scoring output is unchanged when served from cache vs fresh fetch', async () => {
  __resetForecastCacheForTests()
  const payload = { hourly: { wave_height: [1.2], wave_period: [11], wave_direction: [275] } }
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson(payload)
  }

  const fresh = await fetchCachedForecastJson(surfOptions(fetcher))
  const cached = await fetchCachedForecastJson(surfOptions(fetcher))
  const scoringInputsFrom = (data) => ({
    spotKey: 'jaren',
    swellHeightM: data.hourly.wave_height[0],
    swellPeriodS: data.hourly.wave_period[0],
    swellDirDeg: data.hourly.wave_direction[0],
    windSpeedMs: 4,
    windDirDeg: 90,
  })

  assert.equal(calls, 1)
  assert.deepEqual(cached.payload, fresh.payload)
  assert.deepEqual(scoringInputsFrom(cached.payload), scoringInputsFrom(fresh.payload))
})

test('default Open-Meteo cache TTL is 15 minutes', () => {
  assert.equal(forecastCacheTtlMs(), 15 * 60 * 1000)
  assert.equal(forecastCacheTtlMs({ frameRequest: true, configUnchangedSinceFetch: true }), 4 * 60 * 60 * 1000)
})
