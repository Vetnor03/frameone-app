import { createHash } from 'node:crypto'
import { buildWeatherInsight, type MediumWeatherInput, type WeatherInsightHour } from '../weatherMirror'

type RecordLike = Record<string, unknown>
type CacheEntry = { insight: string; expiresAt: number }

const CACHE_TTL_MS = 3 * 60 * 60 * 1000
const AI_TIMEOUT_MS = 4500
const MAX_INSIGHT_CHARS = 88
const cache = new Map<string, CacheEntry>()

function record(value: unknown): RecordLike { return value && typeof value === 'object' ? value as RecordLike : {} }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function numberAt(value: unknown, index: number) { const n = Number(array(value)[index]); return Number.isFinite(n) ? n : null }
function stringAt(value: unknown, index: number) { const v = array(value)[index]; return typeof v === 'string' ? v : '' }
function localHour(iso: string) { const match = iso.match(/T(\d{2})/); return match ? Number(match[1]) : null }
function partOfDay(hour: number) { return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night' }
function outputText(payload: RecordLike) {
  if (typeof payload.output_text === 'string') return payload.output_text
  for (const item of array(payload.output)) for (const content of array(record(item).content)) {
    const text = record(content).text
    if (typeof text === 'string') return text
  }
  return ''
}

export type CompactWeatherInsightForecast = {
  localNow: string
  period: string
  sunrise?: string
  sunset?: string
  hours: Array<{ time: string; temperatureC: number | null; feelsLikeC: number | null; precipitationProbability: number | null; precipitationMm: number | null; weatherCode: number | null; windMs: number | null; gustMs: number | null }>
}

export function compactWeatherInsightForecast(payload: unknown): CompactWeatherInsightForecast | null {
  const weather = record(payload), current = record(weather.current), hourly = record(weather.hourly), daily = record(weather.daily)
  const localNow = typeof current.time === 'string' ? current.time : ''
  const nowHour = localHour(localNow)
  const times = array(hourly.time)
  if (!localNow || nowHour == null || !times.length) return null
  const horizon = nowHour >= 21 ? 15 : nowHour >= 17 ? 12 : 14
  const rows = times.flatMap((raw, index) => {
    if (typeof raw !== 'string' || raw < localNow || index % 2 !== 0 && raw.slice(0, 10) === localNow.slice(0, 10)) return []
    if (new Date(raw).getTime() > new Date(localNow).getTime() + horizon * 3600000) return []
    return [{ time: raw, temperatureC: numberAt(hourly.temperature_2m, index), feelsLikeC: numberAt(hourly.apparent_temperature, index), precipitationProbability: numberAt(hourly.precipitation_probability, index), precipitationMm: numberAt(hourly.precipitation, index), weatherCode: numberAt(hourly.weather_code, index), windMs: numberAt(hourly.wind_speed_10m, index), gustMs: numberAt(hourly.wind_gusts_10m, index) }]
  }).slice(0, 10)
  if (!rows.length) return null
  return { localNow, period: partOfDay(nowHour), sunrise: stringAt(daily.sunrise, 0) || undefined, sunset: stringAt(daily.sunset, 0) || undefined, hours: rows }
}

function deterministicInput(payload: unknown): MediumWeatherInput {
  const weather = record(payload), current = record(weather.current), hourly = record(weather.hourly)
  const now = typeof current.time === 'string' ? current.time : ''
  const date = now.slice(0, 10)
  const hours: WeatherInsightHour[] = array(hourly.time).flatMap((raw, index) => typeof raw === 'string' && raw.startsWith(date) ? [{ hour: localHour(raw) ?? -1, tempC: numberAt(hourly.temperature_2m, index), precipMm: numberAt(hourly.precipitation, index), windMs: Math.max(numberAt(hourly.wind_speed_10m, index) ?? 0, numberAt(hourly.wind_gusts_10m, index) ?? 0), wmo: numberAt(hourly.weather_code, index) }] : [])
  return { units: 'metric', showHiLo: true, localHour: localHour(now), todayHours: hours }
}

function severeInsight(input: MediumWeatherInput) {
  const all = buildWeatherInsight(input)
  return /Thunder|Snow|Sleet|Heavy rain|Dense fog|Strong wind/i.test(all) ? all : ''
}

function safeInsight(value: unknown) {
  if (typeof value !== 'string') return ''
  const clean = value.replace(/\s+/g, ' ').trim()
  if (!clean || clean.toUpperCase() === 'NONE' || clean.length > MAX_INSIGHT_CHARS || /[\r\n]/.test(value)) return ''
  return clean
}

export async function resolveWeatherInsight(payload: unknown, fetcher: typeof fetch = fetch): Promise<string> {
  const fallbackInput = deterministicInput(payload)
  const severe = severeInsight(fallbackInput)
  if (severe) return severe
  const compact = compactWeatherInsightForecast(payload)
  const apiKey = process.env.OPENAI_API_KEY
  if (!compact || !apiKey) return buildWeatherInsight(fallbackInput)
  const model = process.env.FRAME_AI_MODEL || 'gpt-5-mini'
  const fingerprint = createHash('sha256').update(JSON.stringify({ model, compact })).digest('hex')
  const cached = cache.get(fingerprint)
  if (cached && cached.expiresAt > Date.now()) return cached.insight
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model, store: false,
      input: [{ role: 'system', content: [{ type: 'input_text', text: `Decide whether the supplied upcoming forecast contains anything genuinely useful or noteworthy for someone glancing at a household information display. Prioritize meaningful changes, inconvenience, timing, unusual conditions, or particularly notable pleasant weather. Avoid ordinary descriptions and never mention weather before localNow. Use only supplied values; do not infer unsupported events. Return one very short natural sentence (maximum ${MAX_INSIGHT_CHARS} characters), or exactly NONE.` }] }, { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(compact) }] }],
      max_output_tokens: 60,
    }) })
    if (!response.ok) throw new Error(`OpenAI status ${response.status}`)
    const insight = safeInsight(outputText(await response.json() as RecordLike))
    cache.set(fingerprint, { insight, expiresAt: Date.now() + CACHE_TTL_MS })
    return insight
  } catch (error) {
    console.warn('[weather-insight] AI unavailable; using deterministic fallback', { error: error instanceof Error ? error.message : 'unknown' })
    return buildWeatherInsight(fallbackInput)
  } finally { clearTimeout(timeout) }
}
