import test from 'node:test'
import assert from 'node:assert/strict'
import { compactWeatherInsightForecast, resolveWeatherInsight, clearWeatherInsightCache } from '../app/lib/server/weatherInsight.mjs'

function forecast({ now = '2026-08-24T14:00', changes = {} } = {}) {
  const time = Array.from({ length: 20 }, (_, index) => `2026-08-24T${String(10 + index).padStart(2, '0')}:00`)
  const field = (name, fallback) => time.map((_, index) => changes[name]?.[index] ?? fallback)
  return {
    current: { time: now },
    hourly: {
      time,
      temperature_2m: field('temperature', 16), apparent_temperature: field('feelsLike', 15),
      precipitation_probability: field('probability', 0), precipitation: field('precipitation', 0),
      weather_code: field('code', 1), wind_speed_10m: field('wind', 3), wind_gusts_10m: field('gust', 5),
    },
    daily: { sunrise: ['2026-08-24T06:02'], sunset: ['2026-08-24T20:41'] },
  }
}

function aiResponse(text) {
  return async () => ({ ok: true, json: async () => ({ output_text: text }) })
}

function inputBody(calls) {
  const request = JSON.parse(calls[0][1].body)
  return JSON.parse(request.input[1].content[0].text)
}

test.beforeEach(() => clearWeatherInsightCache())

test('full-hour input preserves a brief event on an formerly skipped odd index', async () => {
  const data = forecast({ changes: { precipitation: { 5: 0.8 }, probability: { 5: 80 }, code: { 5: 61 } } })
  const calls = []
  await resolveWeatherInsight(data, { apiKey: 'test', locationKey: 'full-hours', fetcher: async (...args) => { calls.push(args); return { ok: true, json: async () => ({ output_text: 'Rain arrives around 15:00.' }) } } })
  const hours = inputBody(calls).hours
  assert.equal(hours.length, 15)
  assert.deepEqual(hours.find(hour => hour.time.endsWith('15:00')), { time: '2026-08-24T15:00', temperatureC: 16, feelsLikeC: 15, precipitationProbability: 80, precipitationMm: 0.8, weatherCode: 61, windMs: 3, gustMs: 5 })
})

test('compact input excludes weather before localNow', () => {
  const compact = compactWeatherInsightForecast(forecast({ now: '2026-08-24T14:30' }))
  assert.ok(compact.hours.every(hour => hour.time >= '2026-08-24T14:30'))
  assert.equal(compact.hours[0].time, '2026-08-24T15:00')
})

test('severe deterministic insight bypasses OpenAI', async () => {
  let calls = 0
  const data = forecast({ changes: { precipitation: { 6: 3 }, code: { 6: 82 } } })
  const result = await resolveWeatherInsight(data, { apiKey: 'test', locationKey: 'severe', fetcher: async () => { calls++; throw new Error('must not call') } })
  assert.equal(result, 'Heavy rain around 16:00.')
  assert.equal(calls, 0)
})

test('AI NONE becomes an empty optional insight', async () => {
  assert.equal(await resolveWeatherInsight(forecast(), { apiKey: 'test', locationKey: 'none', fetcher: aiResponse('NONE') }), '')
})

test('a concise useful AI response is returned', async () => {
  assert.equal(await resolveWeatherInsight(forecast(), { apiKey: 'test', locationKey: 'useful', fetcher: aiResponse('Rain arrives around 15:00.') }), 'Rain arrives around 15:00.')
})

test('AI failure returns the existing deterministic fallback', async () => {
  const data = forecast({ changes: { precipitation: { 5: 0.5 }, code: { 5: 61 } } })
  const result = await resolveWeatherInsight(data, { apiKey: 'test', locationKey: 'failure', fetcher: async () => { throw new Error('offline') } })
  assert.equal(result, 'Rain this afternoon.')
})

test('cache survives time progression and small forecast noise', async () => {
  let calls = 0
  const fetcher = async () => { calls++; return { ok: true, json: async () => ({ output_text: 'Clearing later.' }) } }
  await resolveWeatherInsight(forecast(), { apiKey: 'test', locationKey: 'oslo', now: 1_000, fetcher })
  const noisy = forecast({ now: '2026-08-24T14:15', changes: { temperature: { 5: 16.4 }, wind: { 5: 3.4 } } })
  assert.equal(await resolveWeatherInsight(noisy, { apiKey: 'test', locationKey: 'oslo', now: 901_000, fetcher }), 'Clearing later.')
  assert.equal(calls, 1)
})

test('meaningful forecast changes regenerate the cached insight', async () => {
  let calls = 0
  const fetcher = async () => ({ ok: true, json: async () => ({ output_text: ++calls === 1 ? 'Dry for now.' : 'Rain arrives later.' }) })
  await resolveWeatherInsight(forecast(), { apiKey: 'test', locationKey: 'change', now: 1_000, fetcher })
  const wet = forecast({ changes: { precipitation: { 7: 0.8 }, probability: { 7: 80 }, code: { 7: 61 } } })
  assert.equal(await resolveWeatherInsight(wet, { apiKey: 'test', locationKey: 'change', now: 2_000, fetcher }), 'Rain arrives later.')
  assert.equal(calls, 2)
})
