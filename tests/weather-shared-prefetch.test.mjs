import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const shared = readFileSync(new URL('../app/lib/server/weatherSharedCache.ts', import.meta.url), 'utf8')
const weatherRoute = readFileSync(new URL('../app/api/weather/details/route.ts', import.meta.url), 'utf8')
const prefetch = readFileSync(new URL('../app/api/cron/weather-prefetch/route.ts', import.meta.url), 'utf8')
const transport = readFileSync(new URL('../app/lib/server/forecastCache.ts', import.meta.url), 'utf8')
const surf = readFileSync(new URL('../app/api/surf/score/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20261013060000_add_weather_forecast_cache.sql', import.meta.url), 'utf8')

test('Open-Meteo requests are sequential and Surf candidates do not fan out', () => {
  assert.match(transport, /MAX_CONCURRENT_OPEN_METEO_REQUESTS = 1/)
  assert.match(transport, /fetchOpenMeteoWithRecovery\(options\.dataType/)
  assert.match(surf, /const CONCURRENCY = 1/)
  assert.doesNotMatch(surf, /forceRefresh: truthy1\(url\.searchParams\.get\('forceRefresh'\)\) \|\| truthy1\(url\.searchParams\.get\('refresh'\)\)/)
})

test('frame Weather uses the shared database cache while app response contract remains unchanged', () => {
  assert.match(weatherRoute, /framePayload\s*\? fetchSharedFrameWeatherForecast/)
  assert.match(weatherRoute, /: fetchWeatherForecast\(/)
  assert.match(shared, /\.from\('weather_forecast_cache'\)\.upsert/)
  assert.match(shared, /\.eq\('cache_key', key\)/)
  assert.match(shared, /WEATHER_LAST_GOOD_MAX_MS = 8 \* 60 \* 60 \* 1000/)
  assert.match(shared, /cachedResult<T>\(row, key, ageMs, true\)/)
})

test('prefetch only targets configured visible weather locations and does not wake the device', () => {
  assert.match(prefetch, /ACTIVE_DEVICE_WINDOW_MS = 24/)
  assert.match(prefetch, /activeIds\.has\(Number\(location\.id/)
  assert.match(prefetch, /sharedWeatherCacheKey\(loc\.lat, loc\.lon, loc\.days\)/)
  assert.match(prefetch, /crypto\.timingSafeEqual/)
  assert.doesNotMatch(prefetch, /device_update_requests|device_update_state|\/api\/device\/render-state|\/api\/device\/refresh/)
})

test('persistent weather cache is only readable by the server service role', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.weather_forecast_cache from anon, authenticated/)
  assert.match(migration, /grant select, insert, update, delete on table public\.weather_forecast_cache to service_role/)
})
