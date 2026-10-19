/**
 * Deterministic next-day Good to know summary shared by the physical frame
 * and Mirror View. Uses the full (not compacted) Open-Meteo hourly forecast;
 * no extra API call or AI invocation.
 */
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const num = (arr, i) => {
  const v = Array.isArray(arr) ? arr[i] : undefined
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const isThunder = c => c != null && c >= 95 && c <= 99
const isSnow = c => c != null && ((c >= 71 && c <= 77) || c === 85 || c === 86)
const isSleet = c => c != null && (c === 56 || c === 57 || c === 66 || c === 67)
const isRain = c => c != null && ((c >= 51 && c <= 65) || (c >= 80 && c <= 82))
const isFog = c => c === 45 || c === 48

function dayPart(hour) {
  if (hour == null) return ''
  return hour < 11 ? ' in the morning' : hour < 17 ? ' in the afternoon' : hour < 21 ? ' in the evening' : ' overnight'
}

export function buildTomorrowWeatherSummary(payload) {
  const weather = obj(payload)
  const daily = obj(weather.daily)
  const hourly = obj(weather.hourly)
  const nextDate = Array.isArray(daily.time) && typeof daily.time[1] === 'string' ? daily.time[1] : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return ''

  const dailyWmo = num(daily.weather_code, 1)
  const precip = num(daily.precipitation_sum, 1)
  const wind = num(daily.wind_speed_10m_max, 1)
  let firstThunder = null
  let firstSnow = null
  let firstSleet = null
  let firstHeavyRain = null
  let firstRain = null
  let firstFog = null
  const times = Array.isArray(hourly.time) ? hourly.time : []
  for (let i = 0; i < times.length; i++) {
    const time = times[i]
    if (typeof time !== 'string' || !time.startsWith(nextDate + 'T')) continue
    const hour = Number(time.slice(11, 13))
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue
    const wmo = num(hourly.weather_code, i)
    const mm = num(hourly.precipitation, i)
    if (firstThunder == null && isThunder(wmo)) firstThunder = hour
    if (firstSnow == null && isSnow(wmo)) firstSnow = hour
    if (firstSleet == null && isSleet(wmo)) firstSleet = hour
    if (firstHeavyRain == null && mm != null && mm >= 2) firstHeavyRain = hour
    if (firstRain == null && (isRain(wmo) || (mm != null && mm >= 0.3))) firstRain = hour
    if (firstFog == null && isFog(wmo)) firstFog = hour
  }

  let primary = ''
  if (firstThunder != null || isThunder(dailyWmo)) {
    primary = 'Thunderstorms possible' + dayPart(firstThunder) + '.'
  } else if (firstSnow != null || isSnow(dailyWmo)) {
    primary = 'Snow expected' + dayPart(firstSnow) + '.'
  } else if (firstSleet != null || isSleet(dailyWmo)) {
    primary = 'Sleet expected' + dayPart(firstSleet) + '.'
  } else if (firstHeavyRain != null || (precip != null && precip >= 10)) {
    primary = 'Heavy rain expected' + dayPart(firstHeavyRain) + '.'
  } else if (firstRain != null || (precip != null && precip >= 2) || isRain(dailyWmo)) {
    primary = 'Rain expected' + dayPart(firstRain) + '.'
  } else if (firstFog != null || isFog(dailyWmo)) {
    primary = 'Fog possible' + dayPart(firstFog) + '.'
  }

  const windLine = wind != null && wind >= 10
    ? `${wind >= 15 ? 'Very strong' : 'Strong'} winds up to ${Math.round(wind)} m/s.`
    : ''
  if (primary) {
    if (!windLine) return primary
    const combined = primary + ' ' + windLine
    return combined.length <= 88 ? combined : primary
  }
  if (windLine) return windLine

  if (precip != null && precip > 0.2 && precip < 2) return 'Mostly dry, with a chance of light showers.'
  if (dailyWmo === 0) return 'Clear skies and mostly dry weather.'
  if (dailyWmo === 1) return 'Mostly clear and dry throughout the day.'
  if (dailyWmo === 2) return 'Partly cloudy and mostly dry.'
  if (dailyWmo === 3) return 'Cloudy, but mostly dry.'
  if (precip != null && precip <= 0.2 && wind != null && wind < 7) return 'Mostly dry with light winds.'
  if (precip != null && precip <= 0.2) return 'Mostly dry throughout the day.'
  if (dailyWmo != null) return 'Mixed weather expected throughout the day.'
  return 'Forecast details are limited for tomorrow.'
}
