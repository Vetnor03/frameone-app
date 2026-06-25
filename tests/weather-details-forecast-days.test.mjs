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

test('frame=1 compact=2 preserves explicit days=5 and returns compact weather details payload', async () => {
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
            wind_speed_10m_max: Array.from({ length: options.forecastDays }, () => 5),
          },
          hourly: {
            time: Array.from({ length: 30 }, (_, index) => `2026-06-${index < 24 ? '08' : '09'}T${String(index % 24).padStart(2, '0')}:00`),
            temperature_2m: Array.from({ length: 30 }, () => 18),
            weather_code: Array.from({ length: 30 }, () => 2),
            wind_speed_10m: Array.from({ length: 30 }, () => 3),
            precipitation: Array.from({ length: 30 }, () => 0),
            precipitation_probability: Array.from({ length: 30 }, () => 5),
            apparent_temperature: Array.from({ length: 30 }, () => 17),
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

  const response = await GET(new Request('https://example.test/api/weather/details?frame=1&compact=2&days=5&lat=60.3929&lon=5.3221'))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(requestedForecastDays, 5)
  assert.equal(marineCalls, 0)
  assert.deepEqual(Object.keys(body).sort(), ['current', 'daily', 'hourly'])
  assert.deepEqual(Object.keys(body.current).sort(), ['relative_humidity_2m', 'temperature_2m', 'time', 'weather_code'])
  assert.deepEqual(Object.keys(body.daily).sort(), ['precipitation_sum', 'sunrise', 'sunset', 'temperature_2m_max', 'temperature_2m_min', 'time', 'weather_code', 'wind_speed_10m_max'])
  assert.deepEqual(Object.keys(body.hourly).sort(), ['precipitation', 'temperature_2m', 'time', 'weather_code', 'wind_speed_10m'])
  assert.equal(body.daily.sunrise.length, 5)
  assert.equal(body.hourly.time.length, 24)
})


test('legacy frame=1 payload keeps full hourly arrays for existing firmware compatibility', async () => {
  const { GET } = loadWeatherDetailsRoute({
    fetchWeatherForecast: async () => ({
      payload: {
        current: { time: '2026-06-08T12:00', temperature_2m: 18, relative_humidity_2m: 64, weather_code: 2 },
        daily: {
          ...fakeDaily(5),
          sunrise: Array.from({ length: 5 }, (_, index) => `2026-06-${String(8 + index).padStart(2, '0')}T04:00`),
          sunset: Array.from({ length: 5 }, (_, index) => `2026-06-${String(8 + index).padStart(2, '0')}T22:00`),
          precipitation_sum: Array.from({ length: 5 }, () => 0),
          wind_speed_10m_max: Array.from({ length: 5 }, () => 5),
        },
        hourly: {
          time: Array.from({ length: 30 }, (_, index) => `2026-06-${index < 24 ? '08' : '09'}T${String(index % 24).padStart(2, '0')}:00`),
          temperature_2m: Array.from({ length: 30 }, () => 18),
          weather_code: Array.from({ length: 30 }, () => 2),
          wind_speed_10m: Array.from({ length: 30 }, () => 3),
          precipitation: Array.from({ length: 30 }, () => 0),
        },
      },
      debug: {},
      error: null,
      fetchedAt: null,
      expiresAt: null,
    }),
    fetchWeatherMarine: async () => ({ payload: null, debug: {}, error: null, fetchedAt: null, expiresAt: null }),
  })

  const response = await GET(new Request('https://example.test/api/weather/details?frame=1&days=5&lat=60.3929&lon=5.3221'))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.hourly.time.length, 30)
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

test('weather details app payload retains fields required by mirror weather renderer', async () => {
  const { GET } = loadWeatherDetailsRoute({
    fetchWeatherForecast: async (options) => ({
      payload: {
        current: {
          time: '2026-06-08T12:00',
          temperature_2m: 18,
          apparent_temperature: 17,
          weather_code: 2,
          relative_humidity_2m: 64,
          wind_speed_10m: 3,
          wind_direction_10m: 270,
          precipitation: 0,
        },
        daily: {
          ...fakeDaily(options.forecastDays),
          precipitation_sum: Array.from({ length: options.forecastDays }, () => 0),
          wind_speed_10m_max: Array.from({ length: options.forecastDays }, () => 4),
          sunrise: Array.from({ length: options.forecastDays }, (_, index) => `2026-06-${String(8 + index).padStart(2, '0')}T04:00`),
          sunset: Array.from({ length: options.forecastDays }, (_, index) => `2026-06-${String(8 + index).padStart(2, '0')}T22:00`),
          uv_index_max: Array.from({ length: options.forecastDays }, () => 4),
        },
        hourly: {
          time: ['2026-06-08T12:00', '2026-06-08T13:00'],
          temperature_2m: [18, 19],
          weather_code: [2, 2],
          wind_speed_10m: [3, 4],
          precipitation_probability: [5, 10],
          precipitation: [0, 0],
          uv_index: [3, 4],
        },
      },
      debug: {},
      error: null,
      fetchedAt: '2026-06-08T00:00:00.000Z',
      expiresAt: '2026-06-08T00:15:00.000Z',
    }),
    fetchWeatherMarine: async () => ({ payload: { hourly: { sea_surface_temperature: [12, 13] } }, debug: {}, error: null, fetchedAt: null, expiresAt: null }),
  })

  const response = await GET(new Request('https://example.test/api/weather/details?lat=60.3929&lon=5.3221'))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.weather.current.temperature_2m, 18)
  assert.equal(body.weather.daily.temperature_2m_max[0], 20)
  assert.equal(body.weather.daily.temperature_2m_min[0], 10)
  assert.equal(body.weather.daily.time.length, 7)
  assert.equal(body.weather.hourly.temperature_2m[0], 18)
  assert.equal(body.weather.hourly.precipitation_probability[1], 10)
})

test('weather renderers log invalid shapes and never use weather module key as only fallback', () => {
  const homeClient = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const mirrorSnapshot = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
  const moduleWeather = readFileSync(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')

  assert.match(homeClient, /missing-render-fields/)
  assert.match(homeClient, /invalid-response-shape/)
  assert.match(homeClient, /json-parse-failed/)
  assert.doesNotMatch(homeClient, /\|\| 'Weather'\)/)
  assert.doesNotMatch(mirrorSnapshot, /primary: 'WEATHER'/)
  assert.match(moduleWeather, /Weather unavailable/)
  assert.match(moduleWeather, /DynamicJsonDocument doc\(24576\)/)
  assert.match(moduleWeather, /json alloc failed/)
  assert.match(moduleWeather, /missing %s\.%s\\n/)
  assert.doesNotMatch(moduleWeather, /drawCenteredBox\([^;]+"Weather"/s)
})
