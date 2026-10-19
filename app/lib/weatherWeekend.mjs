// Grounded, weather-only weekend note for Thursday evening.
// Uses only the existing forecast; no extra AI requests or source fetches.
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const arrayValue = (items, i) => Array.isArray(items) ? items[i] : undefined
const finiteAt = (items, i) => {
  const value = arrayValue(items, i)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
const pad = value => String(value).padStart(2, '0')
function localNowParts(now, zone) {
  if (typeof zone !== 'string' || !zone) return null
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    })
    const parts = Object.fromEntries(formatter.formatToParts(new Date(now)).map(part => [part.type, part.value]))
    const year = Number(parts.year), month = Number(parts.month)
    const day = Number(parts.day), hour = Number(parts.hour)
    if (![year, month, day, hour].every(Number.isInteger)) return null
    const ymd = [year, pad(month), pad(day)].join('-')
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    return { year, month, day, hour, weekday, ymd }
  } catch { return null }
}
function dayAfter(local, amount) {
  return new Date(Date.UTC(local.year, local.month - 1, local.day + amount))
    .toISOString().slice(0, 10)
}
function brightAndDry(daily, date) {
  const days = obj(daily)
  const index = Array.isArray(days.time) ? days.time.indexOf(date) : -1
  if (index < 0) return null
  const code = finiteAt(days.weather_code, index)
  const rainMm = finiteAt(days.precipitation_sum, index)
  const windMs = finiteAt(days.wind_speed_10m_max, index)
  const highC = finiteAt(days.temperature_2m_max, index)
  if (code == null || rainMm == null || windMs == null || highC == null) return null
  // Sunny or partly cloudy, very little rain and moderate winds.
  // A merely dry but overcast weekend is not notable enough to advertise.
  if (code > 2 || code < 0 || rainMm > 1 || rainMm < 0 || windMs > 8 || windMs < 0) return null
  return { code, rainMm, windMs, highC }
}
const severeWeather = value =>
  /thunder|snow|sleet|heavy rain|dense fog|strong wind|very strong wind|severe|flood/i.test(String(value || ''))

/**
 * Thursday from 18:00 in the forecast location's own time zone, and
 * only when SAT/SUN forecasts are verifiably sunny/mostly dry.
 * Never claim good weather from missing or stale source data.
 *
 * Keep within 88 characters (existing firmware insight buffers).
 */
export function buildWeatherWeekendHighlight(payload, { now = Date.now() } = {}) {
  const weather = obj(payload)
  const local = localNowParts(now, weather.timezone)
  if (!local || local.weekday !== 4 || local.hour < 18) return ''
  const daily = obj(weather.daily)
  if (arrayValue(daily.time, 0) !== local.ymd) return ''

  const saturday = brightAndDry(daily, dayAfter(local, 2))
  const sunday = brightAndDry(daily, dayAfter(local, 3))
  if (!saturday && !sunday) return ''

  if (saturday && sunday) {
    const high = Math.round(Math.max(saturday.highC, sunday.highC))
    return 'The weekend looks bright and mostly dry, with highs around ' + high + '°C.'
  }

  const dayName = saturday ? 'Saturday' : 'Sunday'
  const high = Math.round((saturday || sunday).highC)
  return dayName + ' looks bright and mostly dry, around ' + high + '°C.'
}

/**
 * Preserve near-term severe weather notices. Otherwise show the weekend
 * glimpse within Weather's existing insight area.
 */
export function preferWeatherWeekendHighlight(payload, regularInsight, options = {}) {
  const highlight = buildWeatherWeekendHighlight(payload, options)
  return highlight && !severeWeather(regularInsight) ? highlight : regularInsight
}
