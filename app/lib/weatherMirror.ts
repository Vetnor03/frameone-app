export type WeatherUnits = 'metric' | 'imperial'

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
const PRECIP_HEAVY_MM = 6.0

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

function shouldLabelSnowByTemp(hiC: number | null) {
  return hiC != null && hiC <= 0
}

function hasMeaningfulRainSignal(precipMm: number | null, wmo: number | null) {
  if (precipMm != null && precipMm > PRECIP_MEANINGFUL_MM) return true
  if (isShowersLikeWmo(wmo) && precipMm != null && precipMm > PRECIP_LIGHT_MM) return true
  if (isLiquidPrecipWmo(wmo) && precipMm != null && precipMm >= PRECIP_MODERATE_MM) return true
  return false
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

export function buildWeatherPrecipLine(precipMm: unknown, wmoValue: unknown, hiCValue: unknown) {
  const precip = finiteNumber(precipMm)
  const wmo = finiteNumber(wmoValue)
  const hiC = finiteNumber(hiCValue)
  const snowy = isSnowWmo(wmo) || shouldLabelSnowByTemp(hiC)

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

function hhmmToMinutes(value: string | null | undefined) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''))
  if (!match) return -1
  return Number(match[1]) * 60 + Number(match[2])
}

function currentLocalMinutes() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function isSunDownNow(sunriseHHMM: string | null | undefined, sunsetHHMM: string | null | undefined) {
  const sunrise = hhmmToMinutes(sunriseHHMM)
  const sunset = hhmmToMinutes(sunsetHHMM)
  const now = currentLocalMinutes()
  if (sunrise < 0 || sunset < 0) return false
  return now < sunrise || now >= sunset
}

function clothingTimePhrase(localHour?: number | null) {
  const hour = localHour != null && Number.isFinite(localHour) ? localHour : new Date().getHours()
  if (hour >= 22 || hour < 4) return 'tonight'
  if (hour >= 17) return 'this evening'
  return 'today'
}

export function buildWeatherClothingAdvice(input: MediumWeatherInput) {
  const currentTempC = finiteNumber(input.currentTempC)
  const hiC = finiteNumber(input.hiC)
  const loC = finiteNumber(input.loC)
  const windMaxMs = finiteNumber(input.windMaxMs)
  const precipMm = finiteNumber(input.precipMm)
  const wmo = finiteNumber(input.wmo)

  let refTemp: number | null = null
  if (currentTempC != null) refTemp = currentTempC
  else if (hiC != null && loC != null) refTemp = hiC * 0.6 + loC * 0.4
  else if (hiC != null) refTemp = hiC
  else if (loC != null) refTemp = loC

  const sunDown = input.sunDown ?? isSunDownNow(input.sunriseHHMM, input.sunsetHHMM)
  if (refTemp != null && sunDown) refTemp -= 2

  const time = clothingTimePhrase(input.localHour)
  const snowy = isSnowWmo(wmo) || shouldLabelSnowByTemp(hiC)
  const lightRain = hasLightRainSignal(precipMm, wmo)
  const rainy = hasMeaningfulRainSignal(precipMm, wmo)
  const heavyRain = precipMm != null && precipMm >= PRECIP_HEAVY_MM
  const breezy = windMaxMs != null && windMaxMs >= 5
  const windy = windMaxMs != null && windMaxMs >= 7
  const veryWindy = windMaxMs != null && windMaxMs >= 10
  const umbrellaFriendly = !breezy
  const freezing = refTemp != null && refTemp <= 0
  const cold = refTemp != null && refTemp <= 7
  const cool = refTemp != null && refTemp <= 13
  const mild = refTemp != null && refTemp <= 18
  const warm = refTemp != null && refTemp <= 24
  const needsJacketFromWind = windy && refTemp != null && refTemp <= 15
  const needsWarmJacketFromWind = veryWindy && refTemp != null && refTemp <= 10

  if (snowy || freezing) return veryWindy ? `A warm jacket and boots will feel best ${time}.` : `A warm jacket and boots are recommended ${time}.`
  if (heavyRain) return umbrellaFriendly ? `A rain jacket and umbrella would be wise ${time}.` : `A raincoat with a hood and good shoes would be wise ${time}.`
  if (rainy) {
    if (!umbrellaFriendly) return cold || needsWarmJacketFromWind ? `A proper rain jacket will be the better choice ${time}.` : `A rain jacket will come in handy ${time}.`
    return cold || needsWarmJacketFromWind ? `A proper jacket and umbrella would be wise ${time}.` : `A light jacket and umbrella would be smart ${time}.`
  }
  if (lightRain) {
    if (!umbrellaFriendly) return cold || needsJacketFromWind ? `A light rain jacket would be smart ${time}.` : `A light outer layer may come in handy ${time}.`
    return cold || needsJacketFromWind ? `A light jacket or umbrella may be useful ${time}.` : `You may want to bring an umbrella ${time}.`
  }
  if (needsWarmJacketFromWind) return `A warm jacket will feel best in the wind ${time}.`
  if (cold) return windy ? `A warm jacket will likely feel best ${time}.` : `A warm jacket should be perfect ${time}.`
  if (cool) return needsJacketFromWind ? `A light jacket will be the better choice ${time}.` : `A sweater or light jacket should do just fine ${time}.`
  if (mild) return windy ? `A light jacket is a good idea in the wind ${time}.` : `A sweater or light layer should be enough ${time}.`
  if (warm) {
    if (veryWindy) return `A T-shirt with a light extra layer may feel best ${time}.`
    if (windy) return `A T-shirt should be fine, but bring a light layer for the wind ${time}.`
    if (sunDown) return `A T-shirt is fine, but a light layer may feel nice later ${time}.`
    return `A T-shirt should be perfect ${time}.`
  }
  if (windy) return `Light clothes should work, but the wind may bite ${time}.`
  return `Shorts and a T-shirt should be perfect ${time}.`
}

export function buildMediumWeatherDetail(input: MediumWeatherInput): MediumWeatherDetail {
  const useRest = input.restValid === true
  const hiC = finiteNumber(useRest ? input.restHiC : input.hiC)
  const loC = finiteNumber(useRest ? input.restLoC : input.loC)
  const windMaxMs = finiteNumber(useRest ? input.restWindMaxMs : input.windMaxMs)
  const precipMm = finiteNumber(useRest ? input.restPrecipMm : input.precipMm)
  const wmo = finiteNumber(useRest ? input.restWmo : input.wmo)
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
    weatherAdvice: buildWeatherClothingAdvice({ ...input, hiC, loC, windMaxMs, precipMm, wmo }),
    weatherWindLine: buildWeatherWindLine(windMaxMs),
    weatherPrecipLine: buildWeatherPrecipLine(precipMm, wmo, hiC),
    weatherWmo: wmo,
  }
}
