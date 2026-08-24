import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/weather/details/route.ts', import.meta.url), 'utf8')
const forecast = readFileSync(new URL('../app/lib/server/weatherForecast.ts', import.meta.url), 'utf8')
const firmware = readFileSync(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')

test('server forecast retains rich AI fields but compact frame hourly schema does not', () => {
  for (const field of ['apparent_temperature', 'wind_gusts_10m', 'precipitation_probability']) {
    assert.match(forecast, new RegExp(`'${field}'`))
  }

  const compactFields = route.match(/const FRAME_WEATHER_HOURLY_FIELDS = \[([^\]]+)\]/)?.[1] || ''
  assert.equal(compactFields, "'time', 'temperature_2m', 'weather_code', 'wind_speed_10m', 'precipitation'")
  for (const field of ['apparent_temperature', 'wind_gusts_10m', 'precipitation_probability']) {
    assert.doesNotMatch(compactFields, new RegExp(field))
  }
  assert.match(route, /return \{\s*insight,\s*current:/)
})

test('firmware JSON filter explicitly permits only consumed weather fields and insight', () => {
  assert.match(firmware, /filter\["insight"\] = true/)
  assert.doesNotMatch(firmware, /filter\["(?:current|hourly|daily)"\] = true/)

  for (const field of ['time', 'temperature_2m', 'weather_code', 'wind_speed_10m', 'precipitation']) {
    assert.match(firmware, new RegExp(`filter\\["hourly"\\]\\["${field}"\\] = true`))
  }
  for (const field of ['apparent_temperature', 'wind_gusts_10m', 'precipitation_probability']) {
    assert.doesNotMatch(firmware, new RegExp(`filter\\["hourly"\\]\\["${field}"\\]`))
  }
})
