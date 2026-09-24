import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { buildWeatherInsight } from '../weatherMirror.ts'
import { sanitizeFrameText } from '../frameText.mjs'
import { completeReservedOpenAICall, reserveBackgroundOpenAICall } from './openaiUsage.mjs'

const CACHE_TTL_MS = 150 * 60 * 1000
const AI_TIMEOUT_MS = 4500
const MAX_INSIGHT_CHARS = 88
const MAX_FORECAST_HOURS = 15
const cache = new Map()
let persistentClient

function getPersistentClient() {
  if (persistentClient !== undefined) return persistentClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  persistentClient = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  return persistentClient
}

function persistentCacheKey(locationKey, model) {
  return createHash('sha256').update(`${locationKey}|${model}`).digest('hex')
}

function rowsToObject(rows) { return Object.fromEntries(rows) }
function objectToRows(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Map()
  return new Map(Object.entries(value))
}

async function readPersistentInsight(locationKey, model) {
  const db = getPersistentClient()
  if (!db) return { available: false, row: null }
  try {
    const { data, error } = await db.from('weather_ai_insight_cache')
      .select('model,period,rows,insight,expires_at')
      .eq('cache_key', persistentCacheKey(locationKey, model))
      .maybeSingle()
    if (error) throw error
    return { available: true, row: data || null }
  } catch (error) {
    console.warn('[weather-insight] durable cache unavailable; skipping AI', { code: error?.code || 'unknown' })
    return { available: true, error: true, row: null }
  }
}

async function writePersistentInsight(locationKey, model, compact, insight, expiresAt) {
  const db = getPersistentClient()
  if (!db) return true
  try {
    const { error } = await db.from('weather_ai_insight_cache').upsert({
      cache_key: persistentCacheKey(locationKey, model),
      model,
      period: compact.period,
      rows: rowsToObject(normalizedRows(compact)),
      insight,
      expires_at: new Date(expiresAt).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' })
    if (error) throw error
    return true
  } catch (error) {
    console.warn('[weather-insight] durable cache write failed', { code: error?.code || 'unknown' })
    return false
  }
}

function record(value) { return value && typeof value === 'object' ? value : {} }
function array(value) { return Array.isArray(value) ? value : [] }
function numberAt(value, index) { const n = Number(array(value)[index]); return Number.isFinite(n) ? n : null }
function stringAt(value, index) { const v = array(value)[index]; return typeof v === 'string' ? v : '' }
function localHour(iso) { const match = iso.match(/T(\d{2})/); return match ? Number(match[1]) : null }
function partOfDay(hour) { return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night' }
function outputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text
  for (const item of array(payload.output)) for (const content of array(record(item).content)) {
    const value = record(content).text
    if (typeof value === 'string') return value
  }
  return ''
}

export function compactWeatherInsightForecast(payload) {
  const weather = record(payload), current = record(weather.current), hourly = record(weather.hourly), daily = record(weather.daily)
  const localNow = typeof current.time === 'string' ? current.time : ''
  const nowHour = localHour(localNow)
  const times = array(hourly.time)
  if (!localNow || nowHour == null || !times.length) return null
  const rows = times.flatMap((raw, index) => {
    if (typeof raw !== 'string' || raw < localNow) return []
    return [{ time: raw, temperatureC: numberAt(hourly.temperature_2m, index), feelsLikeC: numberAt(hourly.apparent_temperature, index), precipitationProbability: numberAt(hourly.precipitation_probability, index), precipitationMm: numberAt(hourly.precipitation, index), weatherCode: numberAt(hourly.weather_code, index), windMs: numberAt(hourly.wind_speed_10m, index), gustMs: numberAt(hourly.wind_gusts_10m, index) }]
  }).slice(0, MAX_FORECAST_HOURS)
  if (!rows.length) return null
  return { localNow, period: partOfDay(nowHour), sunrise: stringAt(daily.sunrise, 0) || undefined, sunset: stringAt(daily.sunset, 0) || undefined, hours: rows }
}

function deterministicInput(payload) {
  const weather = record(payload), current = record(weather.current), hourly = record(weather.hourly)
  const now = typeof current.time === 'string' ? current.time : ''
  const date = now.slice(0, 10)
  const hours = array(hourly.time).flatMap((raw, index) => typeof raw === 'string' && raw.startsWith(date) ? [{ hour: localHour(raw) ?? -1, tempC: numberAt(hourly.temperature_2m, index), precipMm: numberAt(hourly.precipitation, index), windMs: Math.max(numberAt(hourly.wind_speed_10m, index) ?? 0, numberAt(hourly.wind_gusts_10m, index) ?? 0), wmo: numberAt(hourly.weather_code, index) }] : [])
  return { units: 'metric', showHiLo: true, localHour: localHour(now), todayHours: hours }
}

function severeInsight(input) {
  const all = buildWeatherInsight(input)
  return /Thunder|Snow|Sleet|Heavy rain|Dense fog|Strong wind/i.test(all) ? all : ''
}

function safeInsight(value) {
  if (typeof value !== 'string') return ''
  const clean = sanitizeFrameText(value)
  if (!clean || clean.toUpperCase() === 'NONE' || clean.length > MAX_INSIGHT_CHARS || /[\r\n]/.test(value)) return ''
  return clean
}

function conditionGroup(code) {
  if (code == null) return null
  if (code >= 95) return 'thunder'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet'
  if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return 'rain'
  if (code === 45 || code === 48) return 'fog'
  return 'ordinary'
}

function normalizedRows(compact) {
  return new Map(compact.hours.map(hour => [hour.time, {
    precip: (hour.precipitationMm ?? 0) >= 0.2 || (hour.precipitationProbability ?? 0) >= 45,
    condition: conditionGroup(hour.weatherCode),
    wind: Math.round((hour.windMs ?? 0) / 2),
    gust: Math.round((hour.gustMs ?? 0) / 3),
    temp: Math.round((hour.temperatureC ?? 0) / 2),
  }]))
}

function materiallyChanged(previous, compact) {
  const next = normalizedRows(compact)
  let compared = 0
  for (const [time, oldHour] of previous.rows) {
    const newHour = next.get(time)
    if (!newHour) continue // Normal clock progression only removes past hours.
    compared++
    if (oldHour.precip !== newHour.precip || oldHour.condition !== newHour.condition || Math.abs(oldHour.wind - newHour.wind) >= 2 || Math.abs(oldHour.gust - newHour.gust) >= 2 || Math.abs(oldHour.temp - newHour.temp) >= 2) return true
  }
  return compared === 0
}

function insightIsPast(insight, localNow) {
  const nowHour = localHour(localNow)
  if (nowHour == null) return false
  const mentioned = [...insight.matchAll(/\b([01]\d|2[0-3]):00\b/g)].map(match => Number(match[1]))
  return mentioned.length > 0 && Math.max(...mentioned) < nowHour
}

export function clearWeatherInsightCache() { cache.clear() }

function noteworthyDryShift(compact) {
  const temps = compact.hours.map(hour => Number(hour.temperatureC)).filter(Number.isFinite)
  const winds = compact.hours.map(hour => Number(hour.windMs)).filter(Number.isFinite)
  const gusts = compact.hours.map(hour => Number(hour.gustMs)).filter(Number.isFinite)
  const span = values => values.length ? Math.max(...values) - Math.min(...values) : 0
  return span(temps) >= 6 || span(winds) >= 5 || span(gusts) >= 6
}

export async function resolveWeatherInsight(payload, options = {}) {
  const fallbackInput = deterministicInput(payload)
  const deterministic = sanitizeFrameText(buildWeatherInsight(fallbackInput))
  // Rain, snow, fog, thunder and strong-wind messages are already deterministic.
  // Never pay an LLM to paraphrase information we can express safely ourselves.
  if (deterministic) return deterministic

  const compact = compactWeatherInsightForecast(payload)
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  if (!compact || !apiKey || !noteworthyDryShift(compact)) return deterministic

  const model = options.model ?? process.env.FRAME_AI_MODEL ?? 'gpt-6-luna'
  const locationKey = options.locationKey || 'default'
  const now = options.now ?? Date.now()
  const cached = cache.get(locationKey)
  if (cached && cached.model === model && cached.period === compact.period && cached.expiresAt > now && !insightIsPast(cached.insight, compact.localNow) && !materiallyChanged(cached, compact)) return cached.insight

  const persistent = await readPersistentInsight(locationKey, model)
  if (persistent.error) return deterministic
  if (persistent.row) {
    const durable = {
      insight: String(persistent.row.insight || ''),
      model: persistent.row.model,
      period: persistent.row.period,
      rows: objectToRows(persistent.row.rows),
      expiresAt: Date.parse(persistent.row.expires_at),
    }
    if (durable.model === model && durable.period === compact.period && durable.expiresAt > now && !insightIsPast(durable.insight, compact.localNow) && !materiallyChanged(durable, compact)) {
      cache.set(locationKey, durable)
      return durable.insight
    }
  }

  const reservation = await reserveBackgroundOpenAICall('weather_insight', model)
  if (!reservation.allowed) return deterministic

  const fetcher = options.fetcher ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? AI_TIMEOUT_MS)
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model, store: false, reasoning: { effort: 'none' },
      input: [{ role: 'system', content: [{ type: 'input_text', text: `Use plain typography: no emoji, decorative Unicode, smart quotes, or en/em dashes. Preserve Norwegian æ/ø/å; the degree symbol is allowed. Keep wording concise and glanceable. Decide whether the supplied upcoming forecast contains anything genuinely useful or noteworthy for someone glancing at a household information display. Prioritize meaningful temperature or wind changes that are not already covered by deterministic weather warnings. Avoid ordinary descriptions and never mention weather before localNow. Use only supplied values; do not infer unsupported events. Return one very short natural sentence (maximum ${MAX_INSIGHT_CHARS} characters), or exactly NONE.` }] }, { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(compact) }] }],
      max_output_tokens: 60,
    }) })
    if (!response.ok) {
      await completeReservedOpenAICall(reservation.id, null, 'error', `http_${response.status}`)
      throw new Error(`OpenAI status ${response.status}`)
    }
    const payload = await response.json()
    await completeReservedOpenAICall(reservation.id, payload)
    const insight = safeInsight(outputText(payload))
    const expiresAt = now + CACHE_TTL_MS
    const entry = { insight, model, period: compact.period, rows: normalizedRows(compact), expiresAt }
    cache.set(locationKey, entry)
    await writePersistentInsight(locationKey, model, compact, insight, expiresAt)
    return insight
  } catch (error) {
    await completeReservedOpenAICall(reservation.id, null, 'error', controller.signal.aborted ? 'timeout' : 'request_failed')
    console.warn('[weather-insight] AI unavailable; using deterministic fallback', { error: error instanceof Error ? error.message : 'unknown' })
    return deterministic
  } finally { clearTimeout(timeout) }
}
