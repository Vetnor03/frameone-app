import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

import {
  __resetForecastCacheForTests,
  fetchCachedForecastJson,
  forecastCacheKey,
} from '../app/lib/server/forecastCache.ts'

const routeSource = readFileSync(new URL('../app/api/weather/details/route.ts', import.meta.url), 'utf8')
const weatherForecastSource = readFileSync(new URL('../app/lib/server/weatherForecast.ts', import.meta.url), 'utf8')

function okJson(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}

function compileCommonJs(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
}

function loadWeatherDetailsRoute(stubs) {
  const code = compileCommonJs(routeSource, 'app/api/weather/details/route.ts')
  const routeModule = { exports: {} }
  const sandbox = {
    module: routeModule,
    exports: routeModule.exports,
    require: (specifier) => {
      if (specifier === 'next/server') {
        return {
          NextResponse: {
            json: (body, init = {}) => ({
              status: init.status ?? 200,
              async json() { return body },
            }),
          },
        }
      }
      if (specifier === '@/app/lib/server/weatherForecast') return stubs
      throw new Error(`Unexpected require: ${specifier}`)
    },
    console,
    URL,
    Promise,
  }
  vm.runInNewContext(code, sandbox, { filename: 'app/api/weather/details/route.ts' })
  return routeModule.exports
}

function fakeDaily(days) {
  return {
    time: Array.from({ length: days }, (_, index) => `2026-06-${String(8 + index).padStart(2, '0')}`),
    weather_code: Array.from({ length: days }, () => 1),
    temperature_2m_max: Array.from({ length: days }, () => 20),
    temperature_2m_min: Array.from({ length: days }, () => 10),
  }
}

test('/api/weather/details without days requests multiple daily forecast days for the app card', async () => {
  let requestedForecastDays = null
  const { GET } = loadWeatherDetailsRoute({
    fetchWeatherForecast: async (options) => {
      requestedForecastDays = options.forecastDays
      return {
        payload: { daily: fakeDaily(options.forecastDays) },
        debug: { openMeteoUrl: `forecast_days=${options.forecastDays}` },
        error: null,
        fetchedAt: '2026-06-08T00:00:00.000Z',
        expiresAt: '2026-06-08T00:15:00.000Z',
      }
    },
    fetchWeatherMarine: async () => ({ payload: null, debug: { openMeteoUrl: 'marine' }, error: null, fetchedAt: null, expiresAt: null }),
  })

  const response = await GET(new Request('https://example.test/api/weather/details?lat=60.3929&lon=5.3221'))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requestedForecastDays, 7)
  assert.ok(body.weather.daily.time.length > 1)
})

test('frame=1 preserves explicit days=5 and returns compact weather details payload', async () => {
  let requestedForecastDays = null
  let marineCalls = 0
  const { GET } = loadWeatherDetailsRoute({
    fetchWeatherForecast: async (options) => {
      requestedForecastDays = options.forecastDays
      return {
        payload: {
          generationtime_ms: 1.23,
          current_units: { temperature_2m: '°C' },
          current: {
            time: '2026-06-08T12:00',
            temperature_2m: 18,
            relative_humidity_2m: 64,
            weather_code: 2,
            apparent_temperature: 17,
            wind_direction_10m: 270,
          },
          daily: {
            ...fakeDaily(options.forecastDays),
            sunrise: Array.from({ length: options.forecastDays }, (_, index) => `2026-06-${String(8 + index).padStart(2, '0')}T04:00`),
            sunset: Array.from({ length: options.forecastDays }, (_, index) => `2026-06-${String(8 + index).padStart(2, '0')}T22:00`),
            uv_index_max: Array.from({ length: options.forecastDays }, () => 4),
            precipitation_sum: Array.from({ length: options.forecastDays }, () => 0),
          },
          hourly: {
            time: ['2026-06-08T12:00'],
            temperature_2m: [18],
            weather_code: [2],
            wind_speed_10m: [3],
            precipitation: [0],
            precipitation_probability: [5],
            apparent_temperature: [17],
          },
          hourly_units: { temperature_2m: '°C' },
        },
        debug: { openMeteoUrl: `forecast_days=${options.forecastDays}` },
        error: null,
        fetchedAt: '2026-06-08T00:00:00.000Z',
        expiresAt: '2026-06-08T00:15:00.000Z',
      }
    },
    fetchWeatherMarine: async () => {
      marineCalls += 1
      return { payload: null, debug: {}, error: null, fetchedAt: null, expiresAt: null }
    },
  })

  const response = await GET(new Request('https://example.test/api/weather/details?frame=1&days=5&lat=60.3929&lon=5.3221'))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requestedForecastDays, 5)
  assert.equal(marineCalls, 0)
  assert.deepEqual(Object.keys(body).sort(), ['current', 'daily', 'hourly'])
  assert.deepEqual(Object.keys(body.current).sort(), ['relative_humidity_2m', 'temperature_2m', 'time', 'weather_code'])
  assert.deepEqual(Object.keys(body.daily).sort(), ['sunrise', 'sunset'])
  assert.deepEqual(Object.keys(body.hourly).sort(), ['precipitation', 'temperature_2m', 'time', 'weather_code', 'wind_speed_10m'])
  assert.equal(body.daily.sunrise.length, 5)
})

function loadWeatherForecastModule(fetchOpenMeteoJson) {
  const code = compileCommonJs(weatherForecastSource, 'app/lib/server/weatherForecast.ts')
  const forecastModule = { exports: {} }
  const sandbox = {
    module: forecastModule,
    exports: forecastModule.exports,
    require: (specifier) => {
      if (specifier === './openMeteo') {
        return {
          buildOpenMeteoUrl: (options) => {
            const base = options.endpoint === 'marine' ? 'https://marine-api.open-meteo.com/v1/marine' : 'https://api.open-meteo.com/v1/forecast'
            const url = new URL(base)
            url.searchParams.set('latitude', String(options.lat))
            url.searchParams.set('longitude', String(options.lon))
            if (options.current?.length) url.searchParams.set('current', options.current.join(','))
            if (options.hourly?.length) url.searchParams.set('hourly', options.hourly.join(','))
            if (options.daily?.length) url.searchParams.set('daily', options.daily.join(','))
            if (options.forecastDays != null) url.searchParams.set('forecast_days', String(options.forecastDays))
            if (options.timezone) url.searchParams.set('timezone', options.timezone)
            for (const [key, value] of Object.entries(options.params ?? {})) {
              if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value))
            }
            return url
          },
          fetchOpenMeteoJson,
        }
      }
      if (specifier === './forecastCache') return {}
      throw new Error(`Unexpected require: ${specifier}`)
    },
    URL,
    Number,
    Math,
  }
  vm.runInNewContext(code, sandbox, { filename: 'app/lib/server/weatherForecast.ts' })
  return forecastModule.exports
}

test('requesting days=5 produces forecast_days=5 in Open-Meteo URL and cache key input', async () => {
  __resetForecastCacheForTests()
  let openMeteoOptions = null
  const { fetchWeatherForecast } = loadWeatherForecastModule(async (options) => {
    openMeteoOptions = options
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(options.lat))
    url.searchParams.set('longitude', String(options.lon))
    url.searchParams.set('forecast_days', String(options.forecastDays))
    return fetchCachedForecastJson({
      dataType: options.dataType,
      provider: 'open-meteo',
      url: url.toString(),
      timeoutMs: options.timeoutMs,
      forecastDays: options.forecastDays,
      forecastRange: options.forecastRange,
      timezone: options.timezone,
      frameRequest: !!options.frameRequest,
      allowStale: options.allowStale,
      fetcher: async () => okJson({ daily: fakeDaily(options.forecastDays) }),
    })
  })

  const result = await fetchWeatherForecast({ lat: 60.3929, lon: 5.3221, timeoutMs: 1000, forecastDays: 5, frameRequest: true })
  const cacheKeyInput = {
    dataType: 'weather',
    provider: 'open-meteo',
    url: result.debug.openMeteoUrl,
    timeoutMs: 1000,
    forecastDays: 5,
    forecastRange: '0-5d',
    timezone: 'auto',
    frameRequest: true,
  }

  assert.equal(openMeteoOptions.forecastDays, 5)
  assert.equal(openMeteoOptions.forecastRange, '0-5d')
  assert.equal(new URL(result.debug.openMeteoUrl).searchParams.get('forecast_days'), '5')
  assert.match(forecastCacheKey(cacheKeyInput), /forecast_days=5/)
})
