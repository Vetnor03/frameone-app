import { createHash } from 'node:crypto'

const INSTANCE_BASES = new Set(['weather', 'surf', 'soccer', 'stocks'])
export const VOLATILE_CONTENT_KEYS = new Set([
  'updated_at', 'requested_at', 'fetched_at', 'fetch_timestamp', 'fetchedAt', 'request_id', 'requestId',
  'debug_id', 'debugId', 'trace_id', 'last_probe_at', 'http_timing', 'http', 'fetch', 'metadata', 'meta',
  'debug', 'diagnostics', 'sourceDiagnostics', 'cache', 'cache_age', 'cacheAge', 'cache_ttl', 'cacheTtl',
  'cache_hit', 'cacheHit', 'stale_at', 'staleAt', 'expires_at', 'expiresAt', 'signature', 'asOf',
])

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const integerId = (value) => { const id = Number(value); return Number.isInteger(id) && id >= 1 && id <= 255 ? id : null }
export function canonicalVisible(value) {
  if (Array.isArray(value)) return value.map(canonicalVisible)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_CONTENT_KEYS.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, canonicalVisible(child)]))
}
export function contentDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalVisible(value))).digest('hex')
}

const roundRendered = (key, value) => {
  if (typeof value === 'number' && /(^|_)(temp(?:erature)?(?:_2m)?(?:_(?:max|min))?|high|low|degrees?)$/i.test(key)) return Math.round(value)
  if (Array.isArray(value)) return value.map((child) => roundRendered(key, child))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, roundRendered(childKey, child)]))
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null
const rounded = (value, digits = 0) => {
  const n = finite(value)
  return n == null ? null : Number(n.toFixed(digits))
}
const renderedPrice = (value) => {
  const n = finite(value)
  return n == null ? null : rounded(n, Math.abs(n) >= 1000 ? 0 : 2)
}
const first = (...values) => values.find((value) => value !== undefined && value !== null)
const pick = (source, keys) => Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]))
const direction = (value) => {
  const n = finite(value)
  return n == null ? null : ((Math.round(n / 45) % 8) + 8) % 8
}
const dimensions = (cell) => ({ w: Number(cell?.w ?? Number(cell?.colSpan ?? 0) * 200), h: Number(cell?.h ?? Number(cell?.rowSpan ?? 0) * 120) })
const renderGeometry = (cell) => ({ ...dimensions(cell), size: String(cell?.size ?? 'ADAPTIVE').toUpperCase() })
const rotationStep = (now) => Math.floor(now / 14_400_000)
const nextRotation = (now) => (rotationStep(now) + 1) * 14_400_000
const firmwareRound = (value) => value < 0 ? -Math.round(-value) : Math.round(value)
const displayTemperature = (value, units) => {
  const n = finite(value)
  if (n == null) return null
  return firmwareRound(String(units).toLowerCase() === 'imperial' ? n * 9 / 5 + 32 : n)
}
const weatherWind = (value) => {
  const wind = finite(value)
  return wind == null ? null : wind > .20 ? { calm: false, roundedWind: firmwareRound(wind) } : { calm: true }
}
const osloParts = (now) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit',
}).formatToParts(new Date(now)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
const osloLocalTime = (year, month, day, hour = 0, minute = 0) => {
  const guess = Date.UTC(year, month - 1, day, hour, minute), probe = osloParts(guess)
  return guess - (Date.UTC(probe.year, probe.month - 1, probe.day, probe.hour, probe.minute) - guess)
}

function weatherCommon(value, config) {
  const source = object(value), current = object(source.current), daily = object(source.daily)
  return { source, current, daily, temperature: displayTemperature(first(current.temperature_2m, source.temperature_2m, source.temperature), config.units), code: first(current.weather_code, source.weather_code, source.wmo) }
}
function weatherDay(common, i, config) {
  return { time: common.daily.time?.[i], high: displayTemperature(common.daily.temperature_2m_max?.[i], config.units), low: displayTemperature(common.daily.temperature_2m_min?.[i], config.units),
    code: first(common.daily.weather_code?.[i], i === 0 ? common.code : undefined), wind: rounded(common.daily.wind_speed_10m_max?.[i]), precipitation: rounded(common.daily.precipitation_sum?.[i]) }
}
function reconstructedWeatherDays(common, config) {
  const hourly = object(common.source.hourly), times = hourly.time ?? []
  if (!times.length) return Array.from({ length: 5 }, (_, i) => weatherDay(common, i, config))
  const dates = [...(common.daily.time ?? []), ...times.map((time) => String(time).slice(0, 10))].filter((date, i, all) => date && all.indexOf(date) === i).slice(0, 5)
  return dates.map((date) => {
    const dailyIndex = (common.daily.time ?? []).findIndex((value) => String(value).slice(0, 10) === date)
    const indexes = times.map((time, index) => ({ time: String(time), index })).filter((entry) => entry.time.slice(0, 10) === date)
    const dailyLow = common.daily.temperature_2m_min?.[dailyIndex], dailyHigh = common.daily.temperature_2m_max?.[dailyIndex]
    let dailyCode = first(common.daily.weather_code?.[dailyIndex], common.code)
    if ([71,73,75,77,85,86].includes(dailyCode) && (dailyLow >= 1 || dailyHigh >= 3)) dailyCode = 63
    if (!indexes.length) return { time: date, high: displayTemperature(dailyHigh, config.units), low: displayTemperature(dailyLow, config.units), code: dailyCode,
      wind: weatherWind(common.daily.wind_speed_10m_max?.[dailyIndex]), precipitation: weatherPrecipLabel(common.daily.precipitation_sum?.[dailyIndex], dailyCode, dailyLow, dailyHigh) }
    const nums = (key) => indexes.map(({ index }) => finite(hourly[key]?.[index])).filter((value) => value != null)
    const temperatures = nums('temperature_2m'), winds = nums('wind_speed_10m'), precipitation = nums('precipitation')
    const codes = nums('weather_code'), counts = new Map(); for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1)
    const severity = (code) => [71,73,75,77,85,86].includes(code) ? 100 : [95,96,99].includes(code) ? 90 : [66,67].includes(code) ? 85 : (code >= 51 && code <= 65) || (code >= 80 && code <= 82) ? 80 : [45,48].includes(code) ? 60 : code === 3 ? 40 : [1,2].includes(code) ? 30 : code === 0 ? 10 : 20
    const ranked = [...counts].sort(([a, ac], [b, bc]) => bc - ac || severity(b) - severity(a)), total = precipitation.reduce((sum, value) => sum + Math.max(0, value), 0)
    const precip = ranked.filter(([code]) => [51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(code))
    let code = (total > 2 && precip.length ? precip : ranked)[0]?.[0] ?? common.code
    const low = temperatures.length ? Math.min(...temperatures) : dailyLow, high = temperatures.length ? Math.max(...temperatures) : dailyHigh
    if ([71,73,75,77,85,86].includes(code) && (low >= 1 || high >= 3)) code = 63
    return { time: date, high: displayTemperature(high, config.units), low: displayTemperature(low, config.units), code,
      wind: weatherWind(winds.length ? Math.max(...winds) : common.daily.wind_speed_10m_max?.[dailyIndex]), precipitation: weatherPrecipLabel(total, code, low, high) }
  })
}
function weatherInsight(common, now) {
  const supplied = first(common.source.insight, common.source.nice_to_know)
  if (supplied) return supplied
  const hourly = object(common.source.hourly), date = String(common.current.time ?? '').slice(0, 10), minHour = osloParts(now).hour
  const rows = (hourly.time ?? []).map((time, i) => ({ hour: Number(String(time).slice(11, 13)), date: String(time).slice(0, 10), precipitation: finite(hourly.precipitation?.[i]), wind: finite(hourly.wind_speed_10m?.[i]), code: finite(hourly.weather_code?.[i]) })).filter((row) => row.date === date && row.hour >= minHour)
  const liquid = (code) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82), snow = (code) => [56,57,66,67,71,73,75,77,85,86].includes(code)
  const rules = [
    ['thunder', (r) => r.code >= 95 && r.code <= 99], ['snow', (r) => snow(r.code)],
    ['heavy', (r) => r.precipitation >= 2 || r.code === 65 || r.code === 82], ['fog', (r) => r.code === 45 || r.code === 48],
    ['wind', (r) => r.wind >= 10], ['rain', (r) => r.precipitation > .2 || liquid(r.code)],
  ]
  const part = (hour) => hour < 12 ? 'this morning' : hour < 17 ? 'this afternoon' : hour < 21 ? 'this evening' : 'tonight'
  for (const [kind, predicate] of rules) {
    const matches = rows.filter(predicate); if (!matches.length) continue
    const firstHour = matches[0].hour, lastHour = matches.at(-1).hour
    if (kind === 'thunder') return `Thunderstorms possible ${part(firstHour)}.`; if (kind === 'snow') return `Snow ${part(firstHour)}.`
    if (kind === 'heavy') return matches.length > 1 ? `Heavy rain ${String(firstHour).padStart(2, '0')}:00-${String(lastHour).padStart(2, '0')}:00.` : `Heavy rain around ${String(firstHour).padStart(2, '0')}:00.`
    if (kind === 'fog') return `Dense fog ${part(firstHour)}.`; if (kind === 'wind') return `Strong winds ${part(firstHour)}.`; return `Rain ${part(firstHour)}.`
  }
  return undefined
}
function weatherRest(common, config) {
  const source = common.source, rest = object(source.rest_of_today ?? source.restToday)
  const times = source.hourly?.time ?? [], current = String(common.current.time ?? ''), currentHour = Number(current.slice(11, 13)), currentDate = current.slice(0, 10)
  const indexes = times.map((time, index) => ({ time: String(time), index })).filter(({ time }) => time.slice(0, 10) === currentDate && Number(time.slice(11, 13)) >= currentHour)
  const values = (key) => indexes.map(({ index }) => finite(source.hourly?.[key]?.[index])).filter((value) => value != null)
  const temps = values('temperature_2m'), winds = values('wind_speed_10m'), precipitationValues = values('precipitation')
  const codes = indexes.map(({ index }) => finite(source.hourly?.weather_code?.[index])).filter((value) => value != null)
  const severity = (code) => [71, 73, 75, 77, 85, 86].includes(code) ? 100 : [95, 96, 99].includes(code) ? 90 : [66, 67].includes(code) ? 85 : (code >= 51 && code <= 65) || (code >= 80 && code <= 82) ? 80 : [45, 48].includes(code) ? 60 : code === 3 ? 40 : [1, 2].includes(code) ? 30 : code === 0 ? 10 : 20
  const counts = new Map(); for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1)
  const precipTotal = precipitationValues.reduce((sum, value) => sum + Math.max(0, value), 0)
  const precipCode = (code) => [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(code)
  const ranked = [...counts].sort(([a, ac], [b, bc]) => bc - ac || severity(b) - severity(a))
  const precipRanked = ranked.filter(([code]) => precipCode(code))
  let derivedCode = (precipTotal > 2 && precipRanked.length ? precipRanked : ranked)[0]?.[0] ?? common.code
  const derivedLow = temps.length ? Math.min(...temps) : undefined, derivedHigh = temps.length ? Math.max(...temps) : undefined
  if ([71, 73, 75, 77, 85, 86].includes(derivedCode) && (derivedLow >= 1 || derivedHigh >= 3)) derivedCode = 63
  const rawHigh = first(rest.temperature_2m_max, source.restHiC, derivedHigh, common.daily.temperature_2m_max?.[0]), rawLow = first(rest.temperature_2m_min, source.restLoC, derivedLow, common.daily.temperature_2m_min?.[0])
  return { rawHigh, rawLow, high: displayTemperature(rawHigh, config.units), low: displayTemperature(rawLow, config.units),
    wind: rounded(first(rest.wind_speed_10m_max, source.restWindMaxMs, winds.length ? Math.max(...winds) : undefined, common.daily.wind_speed_10m_max?.[0])),
    precipitation: first(rest.precipitation_sum, source.restPrecipMm, indexes.length ? precipTotal : undefined, common.daily.precipitation_sum?.[0]),
    code: first(rest.weather_code, source.restWmo, indexes.length ? derivedCode : undefined, common.daily.weather_code?.[0], common.code) }
}
function weatherPrecipLabel(mmValue, code, low, high) {
  const mm = finite(mmValue), snow = [71, 73, 75, 77, 85, 86].includes(Number(code)) || (finite(low) != null && finite(high) != null && Number(high) <= 0)
  if (mm == null || mm <= .2) return 'Mostly dry'
  if (snow) return `Snow:${Math.max(0, Math.floor(mm + .5))}`
  if (mm > 2) return `Rain:${Math.max(0, Math.floor(mm + .5))}`
  if ([51, 53, 55, 56, 57].includes(Number(code))) return 'Light drizzle'
  if ([80, 81, 82].includes(Number(code))) return 'Light showers'
  if ((Number(code) >= 51 && Number(code) <= 67) || [80, 81, 82].includes(Number(code))) return 'Light rain later'
  return 'Mostly dry'
}
function weatherProjectionLegacy(value, cell, config, now) {
  const common = weatherCommon(value, config), size = String(cell?.size).toUpperCase(), rest = weatherRest(common, config)
  const precipitation = weatherPrecipLabel(rest.precipitation, rest.code, rest.rawLow, rest.rawHigh)
  if (size === 'SMALL') return { location: config.label, range: config.showHiLo === false ? common.temperature : [rest.low, rest.high], wind: weatherWind(rest.wind), precipitation, code: rest.code }
  if (size === 'MEDIUM') return { range: config.showHiLo === false ? [common.temperature, common.temperature] : [rest.low, rest.high], wind: weatherWind(rest.wind), precipitation, code: rest.code, insight: weatherInsight(common, now) }
  const days = reconstructedWeatherDays(common, config).slice(0, 4); if (days.length) days[0] = { ...days[0], high: rest.high, low: rest.low, wind: weatherWind(rest.wind), precipitation, code: rest.code }
  if (size === 'LARGE') return { location: config.label, days }
  return { current: common.temperature, humidity: rounded(common.current.relative_humidity_2m), today: days[0], sunrise: common.daily.sunrise?.[0], sunset: common.daily.sunset?.[0], insight: weatherInsight(common, now), forecast: days.slice(1) }
}
function weatherProjectionAdaptive(value, cell, config, now) {
  const common = weatherCommon(value, config), { source, current } = common
  const days = reconstructedWeatherDays(common, config), today = days[0] ?? weatherDay(common, 0, config)
  const { w, h } = dimensions(cell); const area = Number(cell?.colSpan ?? Math.max(1, Math.round(w / 200))) * Number(cell?.rowSpan ?? Math.max(1, Math.round(h / 120)))
  const currentTime = String(current.time ?? '')
  const currentHourIndex = (source.hourly?.time ?? []).findIndex((time) => String(time).slice(0, 13) === currentTime.slice(0, 13))
  const hourlyProbability = currentHourIndex >= 0 ? source.hourly?.precipitation_probability?.[currentHourIndex] : undefined
  const result = { current: {
    temperature_2m: common.temperature, weather_code: today.code,
  } }
  if (area >= 2) result.condition = today.code
  if (area >= 3) Object.assign(result.current, {
    wind_speed_10m: weatherWind(first(current.wind_speed_10m, source.wind_speed_10m)),
    wind_direction_10m: direction(first(current.wind_direction_10m, source.wind_direction_10m)),
  })
  if (area >= 3) {
    result.today = {
      temperature_2m_max: today.high,
      temperature_2m_min: today.low,
    }
  }
  if (area >= 4) result.current.precipitation_probability = rounded(first(hourlyProbability, current.precipitation_probability, source.precipitation_probability))
  if (area >= 4 && area < 8) result.insight = weatherInsight(common, now)
  const forecastCount = area >= 8 && h >= 300 ? (w >= 500 ? 4 : 3) : 0
  if (forecastCount) result.forecast = Array.from({ length: forecastCount }, (_, offset) => {
    const i = offset + 1
    return { time: days[i]?.time, temperature_2m_max: days[i]?.high, weather_code: days[i]?.code }
  })
  else if (area >= 8) result.insight = weatherInsight(common, now)
  return result
}
function weatherProjection(value, cell, config, now) {
  return String(cell?.size ?? 'ADAPTIVE').toUpperCase() === 'ADAPTIVE'
    ? weatherProjectionAdaptive(value, cell, config, now) : weatherProjectionLegacy(value, cell, config, now)
}

const surfValidRating = (...values) => {
  const parsed = values.map((value) => typeof value === 'string' ? Number.parseInt(value, 10) : finite(value)).map((value) => value == null ? null : firmwareRound(value))
  return first(...parsed.filter((value) => value != null && value >= 1 && value <= 6)) ?? null
}
const surfMatched = (value) => value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
function surfRatingState(row) {
  const source = object(row), picked = object(source.picked)
  const experiences = [source.breakdown?.experience, source.experience, picked.breakdown?.experience, picked.experience].map(object)
  const rating = surfValidRating(source.rating, source.score, source.stars,
    experiences[0].blended_rating_1_6, experiences[1].blended_rating_1_6,
    picked.rating, picked.score, picked.stars, experiences[2].blended_rating_1_6, experiences[3].blended_rating_1_6)
  const fromExperience = experiences.some((experience) => surfMatched(experience.matched))
  const dice = fromExperience ? first(rating, surfValidRating(...experiences.flatMap((experience) => [experience.blended_rating_1_6, experience.rating_1_6]))) : null
  return { rating, fromExperience, dice }
}
function surfRow(row, main = false) {
  const source = object(row), inputs = object(source.inputs), picked = object(source.picked), pickedInputs = object(picked.inputs)
  const rating = surfRatingState(source)
  return {
    label: first(source.label, source.day, source.dow, source.date, picked.label, picked.day, picked.dow, picked.date),
    spot: first(source.spot, source.picked?.spot),
    wave: first(source.wave_height_range_label, source.waveRange, source.wave_range, picked.wave_height_range_label, picked.waveRange, picked.wave_range, source.forecast?.wave_height_range_label, rounded(first(inputs.swell_height_m, pickedInputs.swell_height_m, source.wave_height_m), 1)),
    period: rounded(main ? first(inputs.swell_period_s, pickedInputs.swell_period_s, source.swell_period_s, source.period_s, source.period, picked.swell_period_s, picked.period_s, picked.period)
      : first(source.swell_period_s, source.period_s, source.period, picked.swell_period_s, picked.period_s, picked.period)),
    ...(main ? { swellDirection: direction(first(inputs.swell_direction_deg, pickedInputs.swell_direction_deg, source.swell_direction_deg, picked.swell_direction_deg)) } : {}),
    wind: rounded(main ? first(inputs.wind_speed_ms, pickedInputs.wind_speed_ms, source.wind_speed_ms, source.wind_ms, source.wind, picked.wind_speed_ms, picked.wind_ms, picked.wind)
      : first(source.wind_speed_ms, source.wind_ms, source.wind, picked.wind_speed_ms, picked.wind_ms, picked.wind)),
    ...(main ? { windDirection: direction(first(inputs.wind_direction_deg, pickedInputs.wind_direction_deg, source.wind_direction_deg, picked.wind_direction_deg)) } : {}),
    rating: first(surfValidRating(source.finalRating), rating.rating), ratingFromExperience: rating.fromExperience, experienceDiceValue: rating.dice,
    line1: first(source.line1, source.summary),
  }
}
function surfTrend(source, now) {
  const rows = source.dayparts ?? source.forecast?.dayparts ?? source.forecast?.parts ?? []
  const ratings = rows.slice(0, 4).map((row) => surfRatingState(row).rating ?? surfRatingState(row).dice)
  const hour = osloParts(now).hour
  let from = hour >= 21 || hour < 10 ? 0 : hour < 14 ? 1 : 2
  let a = ratings[from], b = ratings[from + 1]
  if (!(a >= 1 && b >= 1)) for (let i = 0; i < 3; i++) if (ratings[i] >= 1 && ratings[i + 1] >= 1) { a = ratings[i]; b = ratings[i + 1]; break }
  return a >= 1 && b >= 1 ? b > a ? '^' : b < a ? 'v' : '-' : null
}
function surfProjection(value, cell, now) {
  const wrapper = object(value), source = object(wrapper.visible ?? wrapper), { w, h } = dimensions(cell)
  const needs = surfNeeds({ w, h }); const result = surfRow(source, true)
  const size = String(cell?.size ?? 'ADAPTIVE').toUpperCase()
  const trendVisible = size === 'MEDIUM' || (size === 'ADAPTIVE' && w >= 300 && h >= 175)
  if (trendVisible) result.trend = surfTrend(source, now)
  if (needs.dayparts) result.dayparts = (source.dayparts ?? source.forecast?.dayparts ?? source.forecast?.parts ?? []).slice(0, w >= 500 ? 4 : 2).map(surfRow)
  if (needs.daily) result.daily = (source.daily ?? source.forecast?.daily ?? []).slice(0, 5).map(surfRow)
  if (size === 'XL') {
    const picked = object(source.picked)
    result.conditions = {
      airMin: rounded(first(source.air?.temp_min_c, source.weather?.temp_min_c, source.forecast?.temp_min_c, source.temp_min_c, source.temps?.air_min_c, picked.air?.temp_min_c, picked.weather?.temp_min_c, picked.forecast?.temp_min_c, picked.temp_min_c, picked.temps?.air_min_c, source.temp_c, source.air?.temp_c, source.weather?.temp_c, picked.temp_c, picked.air?.temp_c, picked.weather?.temp_c)),
      airMax: rounded(first(source.air?.temp_max_c, source.weather?.temp_max_c, source.forecast?.temp_max_c, source.temp_max_c, source.temps?.air_max_c, picked.air?.temp_max_c, picked.weather?.temp_max_c, picked.forecast?.temp_max_c, picked.temp_max_c, picked.temps?.air_max_c, source.temp_c, source.air?.temp_c, source.weather?.temp_c, picked.temp_c, picked.air?.temp_c, picked.weather?.temp_c)),
      waterMin: rounded(first(source.water?.temp_min_c, source.forecast?.water_temp_min_c, source.water_temp_min_c, source.temps?.water_min_c, picked.water?.temp_min_c, picked.forecast?.water_temp_min_c, picked.water_temp_min_c, picked.temps?.water_min_c)),
      waterMax: rounded(first(source.water?.temp_max_c, source.forecast?.water_temp_max_c, source.water_temp_max_c, source.temps?.water_max_c, picked.water?.temp_max_c, picked.forecast?.water_temp_max_c, picked.water_temp_max_c, picked.temps?.water_max_c)),
      weatherWmo: first(source.weather?.code, source.weather?.wmo, source.forecast?.wmo, source.wmo, source.weather_code, picked.weather?.code, picked.weather?.wmo, picked.forecast?.wmo, picked.wmo, picked.weather_code, 3),
      sunrise: first(source.sun?.sunrise, source.sunrise, source.forecast?.sunrise, picked.sun?.sunrise, picked.sunrise, picked.forecast?.sunrise, '--:--'),
      sunset: first(source.sun?.sunset, source.sunset, source.forecast?.sunset, picked.sun?.sunset, picked.sunset, picked.forecast?.sunset, '--:--'),
    }
  }
  return result
}

function stockValues(source, config) {
  const range = String(first(source.chartRange, config.chartRange, 'day')).toLowerCase()
  const rows = Array.isArray(source.selectedSeries) ? source.selectedSeries : (source.series?.[range] ?? source.series?.day ?? [])
  return rows.map((row) => finite(typeof row === 'number' ? row : first(row?.p, row?.price))).filter((n) => n != null)
}
function adaptiveStockPolicy(w, h, validSeries) {
  let family = 'chart_summary'
  if (w < 230 && h < 150) family = 'micro'
  else if (h < 160) family = 'summary_strip'
  else if (w < 260) family = 'summary_stack'
  else if (w >= 650 && h >= 300) family = 'detail_chart'
  else if (h >= 390 && w >= 360) family = 'expanded'
  let usefulWidth = false, usefulHeight = false, selectorWidth = false, selectorHeight = false
  if (family === 'detail_chart') { usefulWidth = w * 54 >= 20400; usefulHeight = h >= 150; selectorWidth = w * 54 >= 27400; selectorHeight = h >= 173 }
  else if (family === 'expanded') { usefulWidth = w >= 208; usefulHeight = h * 40 >= 12200; selectorWidth = w >= 278; selectorHeight = h * 40 >= 14500 }
  else if (family === 'chart_summary' && w > h) { usefulWidth = w * 55 >= 20200; usefulHeight = h >= 136; selectorWidth = w * 55 >= 27200; selectorHeight = h >= 159 }
  else if (family === 'chart_summary') { usefulWidth = w >= 208; usefulHeight = h * 42 >= 11000; selectorWidth = w >= 278; selectorHeight = h * 42 >= 13300 }
  const showChart = validSeries && usefulWidth && usefulHeight
  return { family, showChart, showSelector: showChart && selectorWidth && selectorHeight, showDetails: (family === 'detail_chart' || family === 'expanded') && h >= 300 }
}
function stockChartRect(cell, policy) {
  const { w, h } = dimensions(cell), pad = Math.max(9, Math.min(14, Math.trunc(w * 35 / 1000))), gap = 10
  if (String(cell?.size ?? 'ADAPTIVE').toUpperCase() !== 'ADAPTIVE') {
    // Legacy layouts always draw a chart except SMALL. The exact box only
    // matters to the pixel projection; use the renderer's medium dimensions.
    if (String(cell?.size).toUpperCase() === 'SMALL') return null
    if (String(cell?.size).toUpperCase() === 'MEDIUM') return { w: Math.max(20, w - 64), h: Math.max(20, h - 112) }
    if (String(cell?.size).toUpperCase() === 'XL') return { w: Math.max(20, w - 40), h: Math.max(24, Math.trunc(h / 2) - 64) }
    return { w: Math.max(20, Math.trunc(w / 2) - 34), h: Math.max(20, h - 92) }
  }
  if (!policy.showChart) return null
  if (policy.family === 'detail_chart') return { w: w - Math.trunc(w * .42) - gap - pad, h: h - pad * 2 - 38 }
  if (policy.family === 'expanded') {
    const detailsY = pad + 108, detailsH = 78
    const cy = policy.showSelector ? detailsY + detailsH + 5 + 28 + 7 : detailsY + detailsH + 7
    return { w: w - pad * 2, h: h - pad - cy }
  }
  if (policy.family === 'chart_summary' && w > h) return { w: w - Math.trunc(w * .4) - gap - pad, h: h - pad * 2 - (policy.showSelector ? 32 : 0) }
  if (policy.family === 'chart_summary') return { w: w - pad * 2, h: h - pad - (pad + 108 + 8) - (policy.showSelector ? 31 : 0) }
  return null
}
function stockChartPixels(values, baseline, rect) {
  if (!rect || rect.w <= 6 || rect.h <= 6 || values.length < 2) return rect ? { state: 'no_chart_data' } : null
  let min = Math.min(...values), max = Math.max(...values)
  const reference = finite(baseline)
  if (reference != null && reference > 0) { min = Math.min(min, reference); max = Math.max(max, reference) }
  let span = max - min
  if (span < .0001) span = 1
  const y = (value) => rect.h - firmwareRound(((value - min) / span) * (rect.h - 1))
  const stroke = [y(values[0])]
  for (let dx = 1; dx < rect.w; dx++) {
    const index = dx / (rect.w - 1) * (values.length - 1), lo = Math.floor(index), hi = Math.min(values.length - 1, lo + 1)
    stroke.push(y(values[lo] + (values[hi] - values[lo]) * (index - lo)))
  }
  const referenceY = reference != null && reference > 0 && reference >= min && reference <= max && max - min >= .0001 ? y(reference) : null
  return { w: rect.w, h: rect.h, stroke, referenceY }
}
function stocksProjection(value, cell, config) {
  const source = object(value), quote = object(source.quote), { w, h } = dimensions(cell)
  const values = stockValues(source, config), policy = adaptiveStockPolicy(w, h, values.length >= 2 && values.every(Number.isFinite))
  const selectedRangePercent = values.length >= 2 && Math.abs(values[0]) > .00001 ? (values.at(-1) - values[0]) / values[0] * 100 : null
  const purchasePrice = finite(source.purchasePrice), personal = finite(source.personalChangePercent)
  const purchaseAware = purchasePrice != null && purchasePrice > 0 && personal != null
  const size = String(cell?.size ?? 'ADAPTIVE').toUpperCase(), adaptive = size === 'ADAPTIVE'
  const result = { symbol: source.symbol, name: source.name, currency: source.currency,
    price: renderedPrice(first(quote.price, quote.c)), changePercent: rounded(first(quote.changePercent, quote.dp), 2),
    rangePercent: policy.family === 'micro' ? undefined : rounded(selectedRangePercent, 2),
    thirdValue: adaptive ? undefined : purchaseAware ? { purchaseAware: true, personalChangePercent: rounded(personal, 2) } : { purchaseAware: false, rangePercent: rounded(selectedRangePercent, 2) },
  }
  const chartRect = stockChartRect(cell, policy)
  if (chartRect) {
    result.chartRange = first(source.chartRange, config.chartRange, 'day'); result.chart = stockChartPixels(values, source.baselinePrice, chartRect)
    if (!adaptive) result.chartInputs = { values, baseline: finite(source.baselinePrice) }
  }
  if ((adaptive && policy.showDetails) || size === 'LARGE' || size === 'XL') Object.assign(result, {
    open: renderedPrice(first(quote.open, quote.o)), high: renderedPrice(first(quote.high, quote.h)), low: renderedPrice(first(quote.low, quote.l)),
    previousClose: renderedPrice(first(quote.previousClose, quote.pc)), change: rounded(first(quote.change, quote.d), 2),
  })
  return result
}

function soccerProjection(value, cell) {
  const source = object(value), { w, h } = dimensions(cell)
  const next = source.next ? pick(source.next, ['isHome', 'homeShort', 'home', 'awayShort', 'away', 'utc']) : null
  const last = source.last ? pick(source.last, ['isHome', 'homeShort', 'home', 'awayShort', 'away', 'score']) : null
  const size = String(cell?.size ?? 'ADAPTIVE').toUpperCase()
  const standingSummary = source.standing ? pick(source.standing, ['position', 'points']) : null
  const detail = source.standing ? pick(source.standing, ['playedGames', 'played', 'won', 'draw', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'form']) : null
  const tableWindow = (wanted) => {
    const table = Array.isArray(source.table) ? source.table : [], count = Math.min(table.length, wanted)
    const selected = table.findIndex((row) => row?.isSelected)
    let start = selected < 0 ? 0 : Math.max(0, selected - Math.floor(count / 2))
    if (start + count > table.length) start = table.length - count
    return table.slice(start, start + count).map((row) => pick(row, ['position', 'teamShort', 'points', 'goalDifference', 'gap', 'isSelected']))
  }
  if (size !== 'ADAPTIVE') {
    const common = { next, standing: standingSummary }
    if (size === 'SMALL') return { ...common, teamName: source.teamName }
    if (size === 'MEDIUM') return { ...common, last }
    if (size === 'LARGE') return { ...common, last, table: tableWindow(6) }
    return { ...common, last, table: tableWindow(12), competitionName: source.competitionName,
      topScorer: source.topScorer ? pick(source.topScorer, ['name', 'goals']) : null, details: detail }
  }
  const result = { teamName: source.teamName, competitionName: source.competitionName, next }
  if (!(w < 230 && h < 150)) result.standing = source.standing ? pick(source.standing, ['position', 'points']) : null
  if ((w < 260 && h >= 160) || (w >= 260 && h >= 250)) result.last = last
  const showTable = (w >= 560 && h >= 300) || (h >= 390 && w >= 360)
  if (showTable) result.table = tableWindow(Math.max(3, Math.floor((Math.min(180, h * .38) - 30) / 22)))
  if (h >= 420 && w >= 360) Object.assign(result, {
    standingDetails: source.standing ? pick(source.standing, ['playedGames', 'played', 'won', 'draw', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'form']) : null,
    topScorer: source.topScorer ? pick(source.topScorer, ['name', 'goals']) : null, lastScorers: source.lastScorers,
  })
  return result
}

function groceryProjection(value, cell, now) {
  const source = object(value), items = Array.isArray(source.items) ? source.items : [], { w, h } = dimensions(cell)
  const dinners = Array.isArray(source.dinner_plan) ? source.dinner_plan : [], insights = object(source.insights)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  const todayDinner = dinners.find((row) => row?.date === today), future = dinners.filter((row) => String(row?.date) > today)
  const size = String(cell?.size ?? 'ADAPTIVE').toUpperCase()
  if (size !== 'ADAPTIVE') {
    const capacity = size === 'SMALL' ? 3 : 12, rotation = items.length ? rotationStep(now) % items.length : 0
    const visible = Array.from({ length: Math.min(capacity, items.length) }, (_, i) => items[(rotation + i) % items.length])
      .map((item) => ({ name: first(item.name, item.label), quantity: first(item.quantity, item.qty, 1) }))
    const result = { ok: source.ok, language: source.language, heading: size === 'SMALL' || size === 'MEDIUM' ? todayDinner?.title : undefined,
      items: visible, overflow: Math.max(0, items.length - capacity) }
    if (size === 'LARGE' || size === 'XL') result.menu = { heading: todayDinner?.title, rows: future.slice(0, 7).map((row) => pick(row, ['date', 'title'])) }
    if (size === 'XL') {
      result.running_low = (insights.running_low ?? []).slice(0, 3).map((row) => pick(row, ['name', 'label']))
      result.recipes = (insights.recipes ?? []).slice(0, 2).map((row) => ({ name: row?.name, missing: row?.missing ?? [] }))
    }
    return result
  }
  future.sort((a, b) => String(a?.date).localeCompare(String(b?.date)))
  let family = 'list_columns'
  if (w < 230 && h < 150) family = 'micro'; else if (h < 165) family = 'item_strip'; else if (w < 270) family = 'list_stack'
  else if ((w >= 620 && h >= 300) || (w >= 360 && h >= 390)) family = 'expanded'; else if (w >= 480 && h >= 190) family = 'list_menu'
  const horizontal = family === 'item_strip', columns = family === 'list_columns' && w >= 360 ? 2 : 1
  const showMenu = (family === 'list_menu' || family === 'expanded') && w >= 500 && h >= 180 && future.length >= 2
  const showRunningLow = family === 'expanded' && h >= 300 && (insights.running_low?.length ?? 0) > 0
  const showMealIdeas = family === 'expanded' && h >= 390 && (insights.recipes?.length ?? 0) > 0
  const pad = Math.max(9, Math.min(14, Math.trunc(w * 35 / 1000))), gap = 12
  let topH = Math.max(1, h - pad * 2)
  if (showRunningLow || showMealIdeas) topH = Math.max(1, topH - Math.min(116, Math.trunc(h * 31 / 100)) - gap)
  const todayIsHeading = Boolean(todayDinner) && !showMenu
  const headerH = todayIsHeading && family !== 'item_strip' && family !== 'micro' ? 48 : 32
  const listH = Math.max(0, topH - headerH - 8), overflowH = 18, rowStep = 26
  const unreserved = horizontal ? Math.min(3, items.length) : Math.floor(listH / rowStep) * columns
  let capacity = items.length <= unreserved ? unreserved : horizontal ? Math.min(3, items.length) : Math.floor((listH - overflowH) / rowStep) * columns
  capacity = Math.min(12, Math.min(capacity, items.length))
  const rotation = items.length ? rotationStep(now) % items.length : 0
  const visible = Array.from({ length: capacity }, (_, i) => items[(rotation + i) % items.length]).map((item) => ({ name: first(item.name, item.label), quantity: first(item.quantity, item.qty, 1) }))
  const result = { ok: source.ok, language: source.language, heading: todayIsHeading ? todayDinner.title : undefined, items: visible, overflow: Math.max(0, items.length - capacity) }
  if (showMenu) result.menu = { heading: todayDinner?.title, rows: future.slice(0, Math.max(0, Math.floor((topH - 38) / 24))).map((row) => pick(row, ['date', 'title'])) }
  if (showRunningLow) result.running_low = insights.running_low.slice(0, 3).map((row) => pick(row, ['name', 'label']))
  if (showMealIdeas) result.recipes = insights.recipes.slice(0, 2).map((row) => ({ name: row?.name, missing: (row?.missing ?? []).slice(0, 2) }))
  return result
}

function assistantProjection(value, cell) {
  const source = object(value), { w, h } = dimensions(cell), total = Number(source.update_count ?? source.updates?.length ?? 0)
  const capacity = (h < 245 ? 1 : Math.min(6, Math.max(1, Math.floor((h - 70) / 65))))
  const updates = (Array.isArray(source.updates) ? source.updates : []).filter((row) => row?.topic && row?.summary).slice(0, capacity).map((row) => pick(row, ['topic', 'summary']))
  const secondary = h >= 155 || w >= 360
  return { ok: source.ok, language: source.language, active_watch_count: !total && secondary ? source.active_watch_count : undefined, mode: total ? 'updates' : 'quiet', updates, overflow: Math.max(0, total - capacity), secondary }
}

const reminderRow = (row, cell) => {
  const profile = Number(cell?.h) <= 120 || Number(cell?.w) < 250 ? 'compact' : Number(cell?.w) >= 600 && Number(cell?.h) >= 360 ? 'spacious' : 'standard'
  return {
    title: first(row?.profile_titles?.[profile], row?.title),
    occurrence_date: row?.occurrence_date,
    display_date: row?.display_date,
    days_until: Number(row?.days_until ?? 0), is_overdue: Boolean(row?.is_overdue),
    display_time: String(row?.display_time ?? '').slice(0, 5),
  }
}
function reminderProjection(value, cell, now) {
  const source = object(value), rows = (source.items ?? source.reminders ?? []).map((row, itemIdx) => {
    const projected = reminderRow(row, cell); Object.defineProperty(projected, 'itemIdx', { value: itemIdx }); return projected
  })
  const buckets = []
  for (const row of rows) {
    let bucket = buckets.find((candidate) => candidate.daysUntil === row.days_until)
    if (!bucket) { bucket = { daysUntil: row.days_until, overdue: row.is_overdue || row.days_until < 0, rows: [] }; buckets.push(bucket) }
    bucket.rows.push(row)
  }
  const primary = buckets.find((bucket) => bucket.daysUntil === 0) ?? buckets.find((bucket) => bucket.daysUntil === 1) ?? buckets[0]
  if (!primary) return { ok: source.ok, state: 'empty' }
  const adaptive = String(cell?.size ?? 'ADAPTIVE').toUpperCase() === 'ADAPTIVE'
  if (adaptive) {
    const today = buckets.find((bucket) => bucket.daysUntil === 0), tomorrow = buckets.find((bucket) => bucket.daysUntil === 1)
    if (today || tomorrow) {
      const { w, h } = dimensions(cell), pad = Math.max(9, Math.min(18, firmwareRound(Math.min(w, h) * .08)))
      const usableW = w - pad * 2, usableH = h - pad * 2, shallow = w / h > 1.12 && usableH < 126
      if (shallow) {
        const available = Math.max(0, Math.floor((usableW + 12) / 154)), selected = today ?? tomorrow
        const count = Math.min(selected.rows.length, available)
        return { ok: source.ok, adaptive: 'shallow', sections: [{ daysUntil: selected.daysUntil, visible: selected.rows.slice(0, count), overflow: selected.rows.length - count }] }
      }
      const split = w / h > 1.12 && usableW >= 464 && usableH >= 164
      const heading = usableH >= 104 ? 30 : 0, sectionCount = (today ? 1 : 0) + (tomorrow ? 1 : 0)
      // Split composition also evaluates measured title usefulness. Keeping the
      // densest physically fitting rows here is conservative: it cannot miss a
      // visible row, while the exact chosen text is still retained.
      let capacity = split ? Math.max(sectionCount, Math.floor((usableH - heading - 24) / 38) * sectionCount)
        : Math.max(1, Math.floor((usableH - sectionCount * heading - (sectionCount > 1 ? 10 : 0) - 30 + 4) / 42))
      const selected = { today: 0, tomorrow: 0 }
      while (capacity-- > 0) {
        if (today && selected.today < today.rows.length) selected.today++
        if (capacity-- > 0 && tomorrow && selected.tomorrow < tomorrow.rows.length) selected.tomorrow++
        if ((!today || selected.today === today.rows.length) && (!tomorrow || selected.tomorrow === tomorrow.rows.length)) break
      }
      return { ok: source.ok, adaptive: split ? 'split' : 'vertical', sections: [
        ...(today ? [{ daysUntil: 0, visible: today.rows.slice(0, selected.today), overflow: today.rows.length - selected.today }] : []),
        ...(tomorrow ? [{ daysUntil: 1, visible: tomorrow.rows.slice(0, selected.tomorrow), overflow: tomorrow.rows.length - selected.tomorrow }] : []),
      ] }
    }
  }
  let capacity
  if (adaptive) {
    const { w, h } = dimensions(cell), pad = Math.max(9, Math.min(18, firmwareRound(Math.min(w, h) * .08)))
    capacity = h <= 150 && w > h ? Math.max(1, Math.floor((w - pad * 2 + 12) / 154)) : Math.max(1, Math.floor((h - pad * 2 - Math.min(30, Math.max(20, (h - pad * 2) / 4)) + 4) / 42))
  } else capacity = String(cell?.size).toUpperCase() === 'SMALL' ? 3 : primary.daysUntil === 0 || primary.daysUntil === 1 ? 4 : 3
  capacity = Math.min(primary.rows.length, capacity)
  const start = adaptive ? 0 : rotationStep(now) % primary.rows.length
  const visible = Array.from({ length: capacity }, (_, i) => primary.rows[(start + i) % primary.rows.length])
  const local = osloParts(now), tomorrow = buckets.find((bucket) => bucket.daysUntil === 1)
  const tomorrowNote = (String(cell?.size).toUpperCase() === 'SMALL' || String(cell?.size).toUpperCase() === 'MEDIUM') && primary.daysUntil === 0 && local.hour >= 17 && tomorrow?.rows.length
  const result = { ok: source.ok, primary: { daysUntil: primary.daysUntil, overdue: primary.overdue, visible: visible.map(({ itemIdx: _itemIdx, ...row }) => row), overflow: primary.rows.length - capacity }, tomorrowNote: tomorrowNote ? tomorrow.rows.length : undefined }
  const size = String(cell?.size).toUpperCase()
  if (size === 'LARGE' || size === 'XL') {
    const monthKey = `${local.year}-${String(local.month).padStart(2, '0')}`, nextDate = new Date(Date.UTC(local.year, local.month, 1))
    const nextKey = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`
    const dots = (key) => Object.entries(rows.filter((row) => String(row.occurrence_date).startsWith(`${key}-`)).reduce((out, row) => {
      out[row.occurrence_date] = Math.min(3, (out[row.occurrence_date] ?? 0) + 1); return out
    }, {})).sort(([a], [b]) => a.localeCompare(b))
    result.calendar = { today: `${monthKey}-${String(local.day).padStart(2, '0')}`, current: dots(monthKey), next: size === 'XL' ? dots(nextKey) : undefined }
    if (size === 'XL') {
      const shown = new Set(visible)
      result.next = rows.filter((row) => !shown.has(row) && String(row.occurrence_date) >= result.calendar.today)
        .sort((a, b) => String(a.occurrence_date).localeCompare(String(b.occurrence_date)) || a.itemIdx - b.itemIdx).slice(0, 5)
        .map(({ itemIdx: _itemIdx, ...row }) => row)
    }
  }
  return result
}

const countdownTemplate = (days, now) => {
  const near = [0, 1, 9, 12, 11, 13, 10, 8], mid = [0, 1, 2, 3, 4, 5, 8, 10], far = [0, 1, 2, 3, 4, 5, 6]
  const choices = days <= 7 ? near : days <= 45 ? mid : far
  return choices[rotationStep(now) % choices.length]
}
function countdownProjection(value, cell, now) {
  const source = object(value), size = String(cell?.size ?? 'ADAPTIVE').toUpperCase()
  const limit = size === 'LARGE' || size === 'XL' ? 5 : size === 'ADAPTIVE' && dimensions(cell).h >= 390 ? 6 : 1
  const local = osloParts(now), todaySerial = Date.UTC(local.year, local.month - 1, local.day) / 86_400_000
  const normalized = (source.items ?? []).map((row) => {
    const target = String(first(row?.target_date, row?.date, '')), parsed = /^\d{4}-\d{2}-\d{2}$/.test(target) ? Date.parse(`${target}T00:00:00Z`) / 86_400_000 : todaySerial
    const days = row?.days_left == null ? parsed - todaySerial : Number(row.days_left)
    return { pinned: Boolean(row?.pinned), title: first(row?.title, row?.name, ''), target_date: target, display_date: row?.display_date, days_left: days, isToday: days === 0, isPast: days < 0 }
  }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.isPast) - Number(b.isPast) || a.days_left - b.days_left || a.target_date.localeCompare(b.target_date) || a.title.localeCompare(b.title))
  const heroIndex = normalized.findIndex((row) => !row.isPast), hero = heroIndex >= 0 ? normalized[heroIndex] : normalized[0]
  const items = hero ? [hero, ...normalized.filter((row, index) => index !== heroIndex && !row.isPast).slice(0, limit - 1)] : []
  if (size === 'SMALL' && Number(items[0]?.days_left) > 0) items[0].template = countdownTemplate(Number(items[0].days_left), now)
  return { ok: source.ok, items, calendarToday: size === 'XL' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)) : undefined }
}

function renderConfigProjection(base, cell, config) {
  const module = object(config?.module)
  let visibleModule = {}
  if (base === 'weather') {
    const { w, h } = dimensions(cell), area = Number(cell?.colSpan ?? Math.max(1, Math.round(w / 200))) * Number(cell?.rowSpan ?? Math.max(1, Math.round(h / 120)))
    const adaptive = String(cell?.size ?? 'ADAPTIVE').toUpperCase() === 'ADAPTIVE'
    visibleModule = { configured: Boolean(Number(module.lat) && Number(module.lon)), units: module.units ?? 'metric',
      showHiLo: !adaptive || area >= 3 ? module.showHiLo ?? module.hiLo ?? true : undefined,
      showCondition: adaptive && area >= 2 ? module.showCondition ?? true : undefined,
      label: adaptive ? (area >= 3 ? module.label : undefined) : ['SMALL', 'LARGE'].includes(String(cell?.size).toUpperCase()) ? module.label : undefined }
  } else if (base === 'surf') visibleModule = { spot: module.spot, todaysBest: todaysBest(module) }
  else if (base === 'stocks') visibleModule = pick(module, ['symbol', 'name', 'chartRange'])
  else if (base === 'soccer') visibleModule = pick(module, ['teamName', 'competitionName'])
  else if (base === 'date') visibleModule = pick(module, ['country', 'holidays'])
  return { language: config?.language, timeZone: config?.timeZone, theme: config?.theme, module: visibleModule }
}

export function physicalRenderProjection(moduleKey, visibleValue, cell = {}, renderConfig = {}, now = Date.now()) {
  const base = String(moduleKey).split(':')[0]
  let visible = canonicalVisible(visibleValue)
  if (base === 'weather') visible = weatherProjection(visible, cell, object(renderConfig?.module), now)
  else if (base === 'surf') visible = surfProjection(visible, cell, now)
  else if (base === 'stocks') visible = stocksProjection(visible, cell, object(renderConfig?.module))
  else if (base === 'soccer') visible = soccerProjection(visible, cell)
  else if (base === 'groceries') visible = groceryProjection(visible, cell, now)
  else if (base === 'assistant') visible = assistantProjection(visible, cell)
  else if (base === 'countdown') visible = countdownProjection(visible, cell, now)
  else if (base === 'reminders') visible = reminderProjection(visible, cell, now)
  return { module: base, geometry: renderGeometry(cell), config: canonicalVisible(renderConfigProjection(base, cell, renderConfig)), visible: roundRendered('', canonicalVisible(visible)) }
}

// This projection is shared by the physical render-state endpoint. Inputs have
// already been limited to the exact active module and stripped of sync metadata;
// numeric weather values are quantized exactly as the e-paper labels are.
export function physicalRenderDigest(moduleKey, visibleValue, cell = {}, renderConfig = {}, now = Date.now()) {
  return contentDigest(physicalRenderProjection(moduleKey, visibleValue, cell, renderConfig, now))
}

function nextMidnight(now, timeZone = 'Europe/Oslo') {
  if (timeZone === 'Europe/Oslo') {
    const parts = osloParts(now)
    return osloLocalTime(parts.year, parts.month, parts.day + 1)
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(now)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const offset = localAsUtc - now
  return Date.UTC(parts.year, parts.month - 1, parts.day + 1) - offset
}

function reminderBoundaries(source, now) {
  const rows = Array.isArray(source?.reminders) ? source.reminders : Array.isArray(source?.items) ? source.items : []
  const result = []
  for (const row of rows) {
    for (const [dateKey, timeKeys] of [['occurrence_date', ['display_time', 'due_time']], ['due_date', ['due_time']], ['end_date', ['end_time']]]) {
      const date = String(row?.[dateKey] ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const actualTime = timeKeys.map((key) => String(row?.[key] ?? '')).find((value) => /^\d{2}:\d{2}/.test(value))
      const time = actualTime ? actualTime.slice(0, 5) : '00:00'
      const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number)
      const guess = Date.UTC(year, month - 1, day, hour, minute)
      const oslo = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit',
      }).formatToParts(new Date(guess)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
      const offset = Date.UTC(oslo.year, oslo.month - 1, oslo.day, oslo.hour, oslo.minute) - guess
      const at = guess - offset
      if (Number.isFinite(at) && at > now) result.push(at)
    }
  }
  return [...new Set(result)].sort((a, b) => a - b)
}

export function physicalModuleDeadlines({ settings, sources, now = Date.now() }) {
  const refs = activePhysicalReferences(settings)
  const midnight = nextMidnight(now)
  const deadlines = {}
  for (const ref of refs.values()) {
    if (ref.base === 'date') deadlines[ref.key] = [{ at: midnight, type: 'hard', reason: 'midnight' }]
    else if (ref.base === 'countdown') {
      const at = nextRotation(now)
      const rotates = JSON.stringify(countdownProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(countdownProjection(sources[ref.key], ref.cell, at))
      deadlines[ref.key] = [
        ...(rotates ? [{ at, type: 'hard', reason: 'countdown_template_rotation' }] : []),
        { at: midnight, type: 'hard', reason: 'midnight' },
      ]
    } else if (ref.base === 'reminders') {
      const at = nextRotation(now)
      const rotates = JSON.stringify(reminderProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(reminderProjection(sources[ref.key], ref.cell, at))
      const local = osloParts(now), eveningAt = osloLocalTime(local.year, local.month, local.day, 17)
      const eveningChanges = now < eveningAt && JSON.stringify(reminderProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(reminderProjection(sources[ref.key], ref.cell, eveningAt))
      deadlines[ref.key] = [
        ...reminderBoundaries(sources[ref.key], now).map((boundary) => ({ at: boundary, type: 'hard', reason: 'reminder_boundary' })),
        ...(rotates ? [{ at, type: 'hard', reason: 'reminder_rotation' }] : []),
        ...(eveningChanges ? [{ at: eveningAt, type: 'hard', reason: 'reminder_evening' }] : []),
        { at: midnight, type: 'hard', reason: 'midnight' },
      ]
    }
    else if (ref.base === 'groceries') {
      const at = nextRotation(now)
      const rotates = JSON.stringify(groceryProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(groceryProjection(sources[ref.key], ref.cell, at))
      deadlines[ref.key] = [
        ...(rotates ? [{ at, type: 'hard', reason: 'grocery_rotation' }] : []),
        ...(JSON.stringify(groceryProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(groceryProjection(sources[ref.key], ref.cell, midnight))
          ? [{ at: midnight, type: 'hard', reason: 'grocery_midnight' }] : []),
        { at: now + 30 * 60_000, type: 'soft', reason: 'source_freshness' },
      ]
    }
    else if (ref.base === 'surf') {
      const local = osloParts(now)
      const candidates = [10, 14, 18, 21].map((hour) => osloLocalTime(local.year, local.month, local.day, hour))
      candidates.push(osloLocalTime(local.year, local.month, local.day + 1, 10))
      const currentProjection = JSON.stringify(surfProjection(sources[ref.key], ref.cell, now))
      const at = candidates.find((candidate) => candidate > now && currentProjection !== JSON.stringify(surfProjection(sources[ref.key], ref.cell, candidate)))
      const changes = Boolean(at)
      const configured = ref.id == null ? null : configuredInstance(settings?.modules, ref.base, ref.id)
      const interval = Math.max(5 * 60_000, Number(configured?.refresh) || 30 * 60_000)
      deadlines[ref.key] = [...(changes ? [{ at, type: 'hard', reason: 'surf_daypart' }] : []), { at: now + interval, type: 'soft', reason: 'source_freshness' }]
    }
    else if (ref.base === 'weather') {
      const local = osloParts(now), current = JSON.stringify(weatherProjection(sources[ref.key], ref.cell, configuredInstance(settings?.modules, 'weather', ref.id) ?? {}, now))
      const candidates = Array.from({ length: 24 }, (_, offset) => osloLocalTime(local.year, local.month, local.day, local.hour + offset + 1))
      const at = candidates.find((candidate) => candidate > now && current !== JSON.stringify(weatherProjection(sources[ref.key], ref.cell, configuredInstance(settings?.modules, 'weather', ref.id) ?? {}, candidate)))
      deadlines[ref.key] = [...(at ? [{ at, type: 'hard', reason: 'weather_insight' }] : []), { at: now + 10 * 60_000, type: 'soft', reason: 'source_freshness' }]
    }
    else {
      const configured = ref.id == null ? null : configuredInstance(settings?.modules, ref.base, ref.id)
      const interval = Math.max(5 * 60_000, Number(configured?.refresh) || (ref.base === 'weather' ? 10 * 60_000 : 30 * 60_000))
      deadlines[ref.key] = [{ at: now + interval, type: 'soft', reason: 'source_freshness' }]
    }
  }
  return deadlines
}

export function physicalRenderManifest({ settings, sources, now = Date.now() }) {
  const refs = activePhysicalReferences(settings)
  const deadlines = physicalModuleDeadlines({ settings, sources, now })
  return [...refs.values()].map((ref) => ({
    key: ref.key,
    render_hash: physicalRenderDigest(ref.key, sources[ref.key] ?? null, ref.cell, {
      language: settings?.language ?? settings?.locale ?? 'en',
      timeZone: settings?.timeZone ?? settings?.timezone ?? 'Europe/Oslo',
      theme: settings?.theme ?? 'default',
      module: ref.id == null
        ? canonicalVisible(object(settings?.modules)[ref.base] ?? {})
        : canonicalVisible(configuredInstance(settings?.modules, ref.base, ref.id) ?? {}),
    }, now),
    bounds: { x: Number(ref.cell.col ?? 0) * 200, y: Number(ref.cell.row ?? 0) * 120, w: Number(ref.cell.w ?? 800), h: Number(ref.cell.h ?? 480) },
    partial_safe: true,
    deadlines: deadlines[ref.key] ?? [],
  }))
}

function physicalGeometry(cell) {
  const colSpan = Number(cell?.colSpan), rowSpan = Number(cell?.rowSpan)
  const geometry = `${colSpan}x${rowSpan}`
  const sizes = { '4x1': 'SMALL', '2x2': 'MEDIUM', '4x2': 'LARGE', '4x4': 'XL' }
  return { ...cell, size: sizes[geometry] ?? 'ADAPTIVE', w: colSpan * 200, h: rowSpan * 120 }
}
export function withPhysicalCellGeometry(settings, layouts) {
  const layout = String(settings?.layout ?? 'default')
  const geometry = layout === 'custom' ? [] : (Array.isArray(layouts?.[layout]) ? layouts[layout] : [])
  const bySlot = new Map(geometry.map((cell) => [Number(cell.slot), cell]))
  return { ...settings, cells: (Array.isArray(settings?.cells) ? settings.cells : []).map((raw) => {
    const cell = object(raw)
    const shape = layout === 'custom' ? cell : bySlot.get(Number(cell.slot))
    return shape ? physicalGeometry({ ...cell, ...shape, module: cell.module }) : cell
  }) }
}

export function activePhysicalReferences(settings) {
  const refs = new Map()
  for (const rawCell of Array.isArray(settings?.cells) ? settings.cells : []) {
    const cell = object(rawCell)
    const [rawBase, rawId] = String(cell.module ?? '').trim().toLowerCase().split(':', 2)
    if (!rawBase) continue
    const id = INSTANCE_BASES.has(rawBase) ? (rawId ? integerId(rawId) : 1) : null
    if (INSTANCE_BASES.has(rawBase) && id == null) continue
    const key = id == null ? rawBase : `${rawBase}:${id}`
    if (!refs.has(key)) refs.set(key, { key, base: rawBase, id, cell })
  }
  return refs
}

function configuredInstance(modules, base, id) {
  return (Array.isArray(modules?.[base]) ? modules[base] : []).find((item) => integerId(item?.id) === id) ?? null
}
function url(origin, path, params) {
  const result = new URL(path, origin)
  for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) result.searchParams.set(key, String(value))
  return result
}
function surfNeeds(cell) {
  const width = Number(cell.w ?? 0), height = Number(cell.h ?? 0)
  const daily = width >= 500 && height >= 390 && width * height >= 210000
  return { daily, dayparts: daily || (width >= 330 && height >= 210) || (width >= 250 && height >= 300) }
}
function todaysBest(config) {
  const id = String(config.spotId ?? '').toLowerCase()
  const label = String(config.spot ?? '').trim().toLowerCase()
  return id === '__todays_best__' || label === "today's best" || label === 'todays best' || label === 'dagens beste'
}
function surfUrl(origin, config, settings, needs, spotIdOverride) {
  const params = { hours: 4, frame: 1 }
  if (spotIdOverride) params.spotId = spotIdOverride
  else if (config.spotId) params.spotId = config.spotId
  else params.spot = config.spot || 'Surf'
  if (Number(config.lat) && Number(config.lon)) { params.lat = config.lat; params.lon = config.lon }
  if (needs.dayparts) params.dayparts = 1
  if (needs.daily) { params.daily = 1; params.days = 5 }
  if (!spotIdOverride && todaysBest(config)) {
    const surfSettings = object(settings?.modules?.surf_settings)
    params.fuelPenalty = surfSettings.fuelPenalty ? 1 : 0
    if (surfSettings.fuelPenalty && Number(surfSettings.homeLat) && Number(surfSettings.homeLon)) {
      params.homeLat = surfSettings.homeLat; params.homeLon = surfSettings.homeLon
    }
  }
  return url(origin, '/api/surf/score', params)
}

export function buildContentRequestPlan({ settings, deviceId, origin, now = Date.now() }) {
  const refs = activePhysicalReferences(settings)
  const modules = object(settings?.modules)
  const requests = []
  const timeInputs = {}
  const osloDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  if (refs.has('date')) timeInputs.date = osloDate

  for (const ref of refs.values()) {
    const id = ref.id
    if (ref.base === 'reminders') requests.push({ key: ref.key, url: url(origin, '/api/device/reminders', { device_id: deviceId, limit: 10, tz: 'Europe/Oslo', skip_sync: 0 }) })
    else if (ref.base === 'countdown') requests.push({ key: ref.key, url: url(origin, '/api/device/countdowns', { device_id: deviceId }) })
    else if (ref.base === 'groceries') requests.push({ key: ref.key, url: url(origin, '/api/device/groceries', { device_id: deviceId }) })
    else if (ref.base === 'assistant') requests.push({ key: ref.key, url: url(origin, '/api/device/assistant', { device_id: deviceId }) })
    else if (ref.base === 'stocks') requests.push({ key: ref.key, url: url(origin, '/api/device/stocks', { device_id: deviceId, id }) })
    else if (ref.base === 'weather') {
      const config = configuredInstance(modules, 'weather', id)
      if (config) requests.push({ key: ref.key, url: url(origin, '/api/weather/details', { frame: 1, compact: 2, days: 5, lat: config.lat ?? 59.9139, lon: config.lon ?? 10.7522 }) })
    } else if (ref.base === 'soccer') {
      const config = configuredInstance(modules, 'soccer', id)
      if (config) requests.push({ key: ref.key, url: url(origin, '/api/soccer/frame', { teamId: config.teamId ?? '', competitionId: config.competitionId ?? '' }) })
    } else if (ref.base === 'surf') {
      const config = configuredInstance(modules, 'surf', id)
      if (config) { const needs = surfNeeds(ref.cell); const best = todaysBest(config); requests.push({ key: ref.key, url: surfUrl(origin, config, settings, best && (needs.dayparts || needs.daily) ? { dayparts: false, daily: false } : needs), surf: { config, needs, todaysBest: best, settings, origin } }) }
    }
  }
  return { refs, requests, timeInputs }
}

async function responseJson(fetchImpl, request, authorization) {
  const response = await fetchImpl(request.url, { headers: { authorization }, cache: 'no-store' })
  if (!response.ok) throw new Error(`content_source_${response.status}`)
  return canonicalVisible(await response.json())
}
export async function collectVisibleContent({ settings, deviceId, origin, authorization, now, fetchImpl = fetch }) {
  const plan = buildContentRequestPlan({ settings, deviceId, origin, now })
  const sources = {}
  // Each module is an independent pipeline. Surf winner detail remains ordered
  // inside its own pipeline, while it no longer delays unrelated modules.
  await Promise.all(plan.requests.map(async (request) => {
    const first = await responseJson(fetchImpl, request, authorization)
    if (request.surf?.todaysBest && (request.surf.needs.dayparts || request.surf.needs.daily)) {
      const winnerId = first?.spotId ?? first?.picked?.spotId
      if (winnerId) {
        const winnerRequest = { url: surfUrl(request.surf.origin, request.surf.config, request.surf.settings, request.surf.needs, winnerId) }
        sources[request.key] = { selected_spot_id: winnerId, visible: await responseJson(fetchImpl, winnerRequest, authorization) }
        return
      }
    }
    sources[request.key] = first
  }))
  const groceryItems = Array.isArray(sources.groceries?.items) ? sources.groceries.items : []
  if (groceryItems.length >= 2) plan.timeInputs.groceries_rotation = Math.floor((now ?? Date.now()) / (4 * 60 * 60 * 1000))
  const activeBases = new Set([...plan.refs.values()].map((ref) => ref.base))
  const effectiveModules = {}
  for (const [base, value] of Object.entries(object(settings?.modules))) {
    if (base === 'surf_settings') {
      if (activeBases.has('surf')) effectiveModules[base] = value
      continue
    }
    if (!activeBases.has(base)) continue
    effectiveModules[base] = INSTANCE_BASES.has(base) && Array.isArray(value)
      ? value.filter((item) => plan.refs.has(`${base}:${integerId(item?.id)}`))
      : value
  }
  const activeConfig = canonicalVisible({ ...settings, modules: effectiveModules })
  return { config: activeConfig, active: [...plan.refs.keys()].sort(), time: plan.timeInputs, sources }
}
