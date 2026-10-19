import { buildTomorrowWeatherSummary } from './weatherTomorrow.mjs'

/**
 * Weather-only weekend highlight for the existing compact Weather insight.
 * No new fetch, model call, module or frame setting.
 * Only Thursday after 18:00 or Friday in the forecast's local time.
 */
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const valueAt = (values, index) => {
  const value = Array.isArray(values) ? values[index] : null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function localNowParts(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Europe/Oslo', year: 'numeric', month: '2-digit',
      day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(now))
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return { date: `${fields.year}-${fields.month}-${fields.day}`,
      weekday: fields.weekday, hour: Number(fields.hour) }
  } catch { return null }
}
const weekendDate = (date, offset) => {
  const base = new Date(date + 'T12:00:00Z')
  if (Number.isNaN(base.getTime())) return ''
  base.setUTCDate(base.getUTCDate() + offset)
  return base.toISOString().slice(0, 10)
}
function upcomingHazard(weather, local) {
  const hourly = obj(weather.hourly)
  const times = Array.isArray(hourly.time) ? hourly.time : []
  for (let i = 0; i < times.length; i++) {
    const when = String(times[i] || '')
    if (!when.startsWith(local.date + 'T')) continue
    const hour = Number(when.slice(11, 13))
    if (!Number.isInteger(hour) || hour < local.hour) continue
    const code = valueAt(hourly.weather_code, i)
    const rain = valueAt(hourly.precipitation, i)
    const wind = valueAt(hourly.wind_speed_10m, i)
    if (code != null && ((code >= 71 && code <= 77) || (code >= 85 && code <= 86) ||
      (code >= 95 && code <= 99))) return true
    if ((rain != null && rain >= 2) || (wind != null && wind >= 11)) return true
  }
  return false
}
function suitable(day) {
  return day.code != null && day.code >= 0 && day.code <= 2 &&
    day.rain != null && day.rain <= 1 &&
    day.wind != null && day.wind <= 8 &&
    day.high != null && day.high >= 7
}
function namedDay(name, day) {
  const condition = day.code <= 1 ? 'sunny' : 'partly sunny'
  return `${name} looks ${condition} and mostly dry, around ${Math.round(day.high)}°C.`
}

/**
 * Return a weekend-specific sentence only for meaningfully promising weather.
 * Both weekend days must exist so a missing forecast never implies a good
 * weekend. If only one day qualifies, identify that specific day.
 * A significant current-day warning takes priority over a nice-weekend note.
 */
export function buildWeekendWeatherHighlight(payload, { now = Date.now(), timezone } = {}) {
  const weather = obj(payload)
  const local = localNowParts(now, timezone || weather.timezone)
  if (!local || !((local.weekday === 'Thu' && local.hour >= 18) || local.weekday === 'Fri')) return ''
  if (upcomingHazard(weather, local)) return ''
  // An urgent next-day forecast outranks pleasant weekend expectations.
  if (/^(Thunderstorms|Snow expected|Sleet expected|Heavy rain|Very strong|Strong winds)/.test(buildTomorrowWeatherSummary(weather))) return ''
  const saturday = weekendDate(local.date, local.weekday === 'Thu' ? 2 : 1)
  const sunday = weekendDate(local.date, local.weekday === 'Thu' ? 3 : 2)
  const daily = obj(weather.daily)
  const days = Array.isArray(daily.time) ? daily.time : []
  const satIdx = days.indexOf(saturday), sunIdx = days.indexOf(sunday)
  if (satIdx < 0 || sunIdx < 0) return ''
  const dayAt = index => ({
    code: valueAt(daily.weather_code, index),
    rain: valueAt(daily.precipitation_sum, index),
    wind: valueAt(daily.wind_speed_10m_max, index),
    high: valueAt(daily.temperature_2m_max, index),
  })
  const sat = dayAt(satIdx), sun = dayAt(sunIdx)
  const satGood = suitable(sat), sunGood = suitable(sun)
  if (satGood && sunGood) {
    const high = Math.round(Math.max(sat.high, sun.high))
    return `Weekend looks bright and mostly dry, with highs up to ${high}°C.`
  }
  if (satGood) return namedDay('Saturday', sat)
  if (sunGood) return namedDay('Sunday', sun)
  return ''
}
