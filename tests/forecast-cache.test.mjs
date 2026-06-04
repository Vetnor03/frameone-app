import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __resetForecastCacheForTests,
  __seedForecastCacheForTests,
  fetchCachedForecastJson,
  forecastCacheTtlMs,
} from '../app/lib/server/forecastCache.ts'

function okJson(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}

const weatherOptions = (fetcher) => ({
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
})

const surfOptions = (fetcher) => ({
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
})

test('repeated weather request uses cache and does not call external fetch again', async () => {
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
  assert.equal(second.debug.cacheHit, true)
  assert.equal(second.debug.externalFetch, false)
})

test('repeated surf request uses cache and does not call external fetch again', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson({ hourly: { wave_height: [calls] } })
  }

  const first = await fetchCachedForecastJson(surfOptions(fetcher))
  const second = await fetchCachedForecastJson(surfOptions(fetcher))

  assert.equal(calls, 1)
  assert.deepEqual(first.payload.hourly.wave_height, [1])
  assert.deepEqual(second.payload.hourly.wave_height, [1])
  assert.equal(second.debug.cacheHit, true)
})

test('expired cache triggers new fetch', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return okJson({ marker: calls })
  }
  const opts = weatherOptions(fetcher)
  __seedForecastCacheForTests(opts, { marker: 'old' }, Date.now() - 60_000, 1, 60 * 60 * 1000)

  const result = await fetchCachedForecastJson(opts)

  assert.equal(calls, 1)
  assert.equal(result.payload.marker, 1)
  assert.equal(result.debug.externalFetch, true)
})

test('stale cache is returned if external fetch fails', async () => {
  __resetForecastCacheForTests()
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return new Response('rate limited', { status: 429 })
  }
  const opts = surfOptions(fetcher)
  __seedForecastCacheForTests(opts, { stale: true }, Date.now() - 60_000, 1, 60 * 60 * 1000)

  const result = await fetchCachedForecastJson(opts)

  assert.equal(calls, 1)
  assert.deepEqual(result.payload, { stale: true })
  assert.equal(result.debug.staleUsed, true)
  assert.equal(result.error, '429')
})

test('frame requests never use TTL below 15 minutes', () => {
  assert.equal(forecastCacheTtlMs({ horizonHours: 1, frameRequest: true }), 15 * 60 * 1000)
  assert.ok(forecastCacheTtlMs({ horizonHours: 1, frameRequest: true }) >= 15 * 60 * 1000)
})
