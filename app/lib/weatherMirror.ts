export type WeatherUnits = 'metric' | 'imperial'

export type WeatherInsightHour = { hour: number; tempC?: number | null; precipMm?: number | null; windMs?: number | null; wmo?: number | null }

export type MediumWeatherInput = {
  units: WeatherUnits
  showHiLo: boolean
  currentTempC?: number | null
  hiC?: number | null
  loC?: number | null
  windMaxMs?: number | null
  precipMm?: number | null
  wmo?: number | null
  restValid?: boolean
  restHiC?: number | null
  restLoC?: number | null
  restWindMaxMs?: number | null
  restPrecipMm?: number | null
  restWmo?: number | null
  sunriseHHMM?: string | null
  sunsetHHMM?: string | null
  localHour?: number | null
  sunDown?: boolean | null
  todayHours?: WeatherInsightHour[] | null
}

export type MediumWeatherDetail = {
  weatherLowTemp: string
  weatherHighTemp: string
  weatherAdvice: string
  weatherWindLine: string
  weatherPrecipLine: string
  weatherWmo: number | null
}

const PRECIP_MEANINGFUL_MM = 2.0
const PRECIP_LIGHT_MM = 0.2
const PRECIP_MODERATE_MM = 4.0

function finiteNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function cToDisplay(valueC: number, units: WeatherUnits) {
  return units === 'imperial' ? (valueC * 9) / 5 + 32 : valueC
}

export function formatWeatherTemp(valueC: unknown, units: WeatherUnits) {
  const n = finiteNumber(valueC)
  if (n == null) return '--°'
  return `${Math.round(cToDisplay(n, units))}°${units === 'imperial' ? 'F' : 'C'}`
}

function roundMmToInt(mm: number | null) {
  if (mm == null) return 0
  return Math.max(0, Math.floor(mm + 0.5))
}

export function isSnowWmo(wmo: number | null | undefined) {
  return wmo != null && ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86)
}

export function isLiquidPrecipWmo(wmo: number | null | undefined) {
  return wmo != null && ((wmo >= 51 && wmo <= 67) || (wmo >= 80 && wmo <= 82))
}

function isDrizzleLikeWmo(wmo: number | null | undefined) {
  return wmo != null && wmo >= 51 && wmo <= 55
}

function isShowersLikeWmo(wmo: number | null | undefined) {
  return wmo != null && wmo >= 80 && wmo <= 82
}

function shouldLabelSnowByTemp(loC: number | null, hiC: number | null) {
  return loC != null && hiC != null && hiC <= 0
}

export function normalizeDisplayWmoForTemps(wmo: number | null, loC: number | null, hiC: number | null) {
  if (!isSnowWmo(wmo)) return wmo
  if (loC == null || hiC == null) return wmo

  // Match the frame firmware: avoid showing snow for clearly above-freezing
  // selected periods, where mixed hourly data should present as rain instead.
  if (loC >= 1 || hiC >= 3) return 63
  return wmo
}

function hasLightRainSignal(precipMm: number | null, wmo: number | null) {
  if (precipMm != null && precipMm > PRECIP_LIGHT_MM) return true
  if (isLiquidPrecipWmo(wmo)) return true
  return false
}

export function buildWeatherWindLine(windMaxMs: unknown) {
  const wind = finiteNumber(windMaxMs)
  if (wind != null && wind > 0.2) return `Wind up to ${Math.round(wind)} m/s`
  return 'Calm winds'
}

export function buildWeatherPrecipLine(precipMm: unknown, wmoValue: unknown, loCValue: unknown, hiCValue: unknown) {
  const precip = finiteNumber(precipMm)
  const wmo = finiteNumber(wmoValue)
  const loC = finiteNumber(loCValue)
  const hiC = finiteNumber(hiCValue)
  const snowy = isSnowWmo(wmo) || shouldLabelSnowByTemp(loC, hiC)

  if (snowy) {
    if (precip == null || precip <= PRECIP_LIGHT_MM) return 'Mostly dry'
    const p = roundMmToInt(precip)
    return p <= 0 ? 'Mostly dry' : `Snow: ${p}mm`
  }

  if (precip == null) return 'Mostly dry'

  if (precip > PRECIP_MEANINGFUL_MM) {
    const p = roundMmToInt(precip)
    return p <= 0 ? 'Mostly dry' : `Rain: ${p}mm`
  }

  if (precip > PRECIP_LIGHT_MM && isLiquidPrecipWmo(wmo)) {
    if (isDrizzleLikeWmo(wmo)) return 'Light drizzle'
    if (isShowersLikeWmo(wmo)) return 'Light showers'
    return 'Light rain later'
  }

  return 'Mostly dry'
}

function dayPart(hour: number) {
  if (hour < 12) return 'this morning'
  if (hour < 17) return 'this afternoon'
  if (hour < 21) return 'this evening'
  return 'tonight'
}

function aroundHour(hour: number) {
  return `around ${String(Math.max(0, Math.min(23, Math.round(hour)))).padStart(2, '0')}:00`
}

function isThunderWmo(wmo: number | null | undefined) {
  return wmo != null && wmo >= 95 && wmo <= 99
}

function isFogWmo(wmo: number | null | undefined) {
  return wmo === 45 || wmo === 48
}

function isSleetWmo(wmo: number | null | undefined) {
  return wmo === 56 || wmo === 57 || wmo === 66 || wmo === 67
}

function eventRange(hours: WeatherInsightHour[], predicate: (h: WeatherInsightHour) => boolean) {
  const matches = hours.filter(predicate).sort((a, b) => a.hour - b.hour)
  if (!matches.length) return null
  const first = matches[0].hour
  const last = matches[matches.length - 1].hour
  return { first, last, count: matches.length }
}

export function buildWeatherInsight(input: MediumWeatherInput) {
  const hours = (Array.isArray(input.todayHours) ? input.todayHours : [])
    .map((h) => ({ ...h, hour: Math.round(Number(h.hour)) }))
    .filter((h) => Number.isFinite(h.hour) && h.hour >= 0 && h.hour < 24)
    .sort((a, b) => a.hour - b.hour)
  const localHour = finiteNumber(input.localHour)
  const minHour = localHour == null ? -1 : Math.max(0, Math.min(23, Math.floor(localHour)))
  const upcomingHours = minHour >= 0 ? hours.filter((h) => h.hour >= minHour) : hours

  const thunder = eventRange(upcomingHours, (h) => isThunderWmo(finiteNumber(h.wmo)))
  if (thunder) return `Thunderstorms possible ${dayPart(thunder.first)}.`

  const snow = eventRange(upcomingHours, (h) => isSnowWmo(finiteNumber(h.wmo)) || isSleetWmo(finiteNumber(h.wmo)))
  if (snow) return `${isSleetWmo(finiteNumber(upcomingHours.find((h) => h.hour === snow.first)?.wmo)) ? 'Sleet' : 'Snow'} ${dayPart(snow.first)}.`

  const heavyRain = eventRange(upcomingHours, (h) => (finiteNumber(h.precipMm) ?? 0) >= 2 || finiteNumber(h.wmo) === 65 || finiteNumber(h.wmo) === 82)
  if (heavyRain) return heavyRain.count > 1 ? `Heavy rain ${String(heavyRain.first).padStart(2, '0')}:00-${String(heavyRain.last).padStart(2, '0')}:00.` : `Heavy rain ${aroundHour(heavyRain.first)}.`

  const fog = eventRange(upcomingHours, (h) => isFogWmo(finiteNumber(h.wmo)))
  if (fog) return `Dense fog ${dayPart(fog.first)}.`

  const strongWind = eventRange(upcomingHours, (h) => (finiteNumber(h.windMs) ?? 0) >= 10)
  if (strongWind) return `Strong winds ${dayPart(strongWind.first)}.`

  const rain = eventRange(upcomingHours, (h) => hasLightRainSignal(finiteNumber(h.precipMm), finiteNumber(h.wmo)))
  if (rain) return `Rain ${dayPart(rain.first)}.`

  return ''
}

export const buildWeatherClothingAdvice = buildWeatherInsight

export function buildMediumWeatherDetail(input: MediumWeatherInput): MediumWeatherDetail {
  const useRest = input.restValid === true
  const hiC = finiteNumber(useRest ? input.restHiC : input.hiC)
  const loC = finiteNumber(useRest ? input.restLoC : input.loC)
  const windMaxMs = finiteNumber(useRest ? input.restWindMaxMs : input.windMaxMs)
  const precipMm = finiteNumber(useRest ? input.restPrecipMm : input.precipMm)
  const rawWmo = finiteNumber(useRest ? input.restWmo : input.wmo)
  const wmo = normalizeDisplayWmoForTemps(rawWmo, loC, hiC)
  const currentTempC = finiteNumber(input.currentTempC)

  let lowTemp: string
  let highTemp: string
  if (input.showHiLo && loC != null && hiC != null) {
    lowTemp = formatWeatherTemp(loC, input.units)
    highTemp = formatWeatherTemp(hiC, input.units)
  } else {
    lowTemp = formatWeatherTemp(currentTempC, input.units)
    highTemp = lowTemp
  }

  return {
    weatherLowTemp: lowTemp,
    weatherHighTemp: highTemp,
    weatherAdvice: buildWeatherInsight({ ...input, hiC, loC, windMaxMs, precipMm, wmo }),
    weatherWindLine: buildWeatherWindLine(windMaxMs),
    weatherPrecipLine: buildWeatherPrecipLine(precipMm, wmo, loC, hiC),
    weatherWmo: wmo,
  }
}
