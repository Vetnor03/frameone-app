from pathlib import Path

route_path = Path('app/api/ski/summary/route.ts')
home_path = Path('app/HomePageClient.tsx')
route = route_path.read_text()
home = home_path.read_text()

# Fnugg: expose resort coordinates and top elevation so the powder forecast can use ski-area altitude.
old = """    last_updated: null as string | null,\n  }\n}\n"""
new = """    last_updated: null as string | null,\n    forecast_lat: null as number | null,\n    forecast_lon: null as number | null,\n    top_elevation_m: null as number | null,\n  }\n}\n"""
assert old in route
route = route.replace(old, new, 1)

old = """    'id,name,site_path,location,resort_open,resort_opening_date,resort_closing_date,opening_hours,lifts,slopes,last_updated'\n"""
new = """    'id,name,site_path,location,resort_open,resort_opening_date,resort_closing_date,opening_hours,lifts,slopes,last_updated,weather_zones,default_weather_zones'\n"""
assert old in route
route = route.replace(old, new, 1)

old = """    const sitePath = String(source?.site_path || '').trim()\n    const distanceM = finiteNumber(Array.isArray(candidate?.sort) ? candidate.sort[0] : null)\n\n    return {\n"""
new = """    const sitePath = String(source?.site_path || '').trim()\n    const distanceM = finiteNumber(Array.isArray(candidate?.sort) ? candidate.sort[0] : null)\n    const resortLat = finiteNumber(source?.location?.lat)\n    const resortLon = finiteNumber(source?.location?.lon)\n    const weatherZones = Array.isArray(source?.weather_zones) ? source.weather_zones : []\n    const preferredTopId = String(source?.default_weather_zones?.top || '').trim()\n    const preferredTop = weatherZones.find((zone: any) => String(zone?.id || '').trim() === preferredTopId)\n    const highestZone = weatherZones\n      .map((zone: any) => ({ zone, elevation: finiteNumber(zone?.elevation) }))\n      .filter((entry: any) => entry.elevation != null)\n      .sort((a: any, b: any) => (b.elevation as number) - (a.elevation as number))[0]?.zone\n    const topElevationM = finiteNumber((preferredTop || highestZone)?.elevation)\n\n    return {\n"""
assert old in route
route = route.replace(old, new, 1)

old = """      url: sitePath.startsWith('/') ? `${FNUGG_SITE_BASE}${sitePath}` : FNUGG_SITE_BASE,\n      last_updated: String(source?.last_updated || '').trim() || null,\n    }\n"""
new = """      url: sitePath.startsWith('/') ? `${FNUGG_SITE_BASE}${sitePath}` : FNUGG_SITE_BASE,\n      last_updated: String(source?.last_updated || '').trim() || null,\n      forecast_lat: resortLat,\n      forecast_lon: resortLon,\n      top_elevation_m: topElevationM,\n    }\n"""
assert old in route
route = route.replace(old, new, 1)

# Add a conservative powder estimator. MET precipitation is liquid-equivalent, so return a range rather than fake precision.
marker = """function compactForecast(timeseries: any[]) {\n"""
insert = r'''type NextPowderDay = {
  found: boolean
  date: string | null
  estimated_fresh_cm_low: number | null
  estimated_fresh_cm_high: number | null
  estimated_fresh_cm_mid: number | null
  precipitation_mm: number | null
  mean_snow_temp_c: number | null
  peak_wind_mps: number | null
  elevation_m: number | null
  basis: 'resort_top' | 'selected_location'
  confidence: 'medium' | 'low' | null
}

function snowRatioForTemperature(tempC: number) {
  if (tempC <= -8) return 1.4
  if (tempC <= -4) return 1.25
  if (tempC <= -1) return 1.1
  if (tempC <= 0.5) return 0.9
  return 0.7
}

function estimateNextPowderDay(
  timeseries: any[],
  basis: 'resort_top' | 'selected_location',
  elevationM: number | null
): NextPowderDay {
  const today = osloParts(new Date()).date
  const grouped = new Map<string, {
    snowCm: number
    precipitationMm: number
    weightedTemp: number
    weight: number
    maxWind: number | null
    explicitSnowPoints: number
  }>()

  for (const point of timeseries) {
    const time = String(point?.time || '')
    if (!time) continue
    const local = osloParts(time)
    if (!local.date || local.date <= today) continue

    const instant = point?.data?.instant?.details ?? {}
    const period = point?.data?.next_1_hours ?? point?.data?.next_6_hours ?? null
    if (!period) continue

    const precipitation = finiteNumber(period?.details?.precipitation_amount)
    const temp = finiteNumber(instant?.air_temperature)
    const wind = finiteNumber(instant?.wind_speed)
    const symbol = String(period?.summary?.symbol_code || '').toLowerCase()
    if (precipitation == null || precipitation <= 0 || temp == null) continue

    const explicitSnow = symbol.includes('snow') && !symbol.includes('sleet')
    const sleet = symbol.includes('sleet')
    const coldEnoughForLikelySnow = temp <= 0.5
    if (!explicitSnow && !coldEnoughForLikelySnow) continue
    if (sleet && temp > 0) continue
    if (temp > 1) continue

    let estimatedSnowCm = precipitation * snowRatioForTemperature(temp)
    if (sleet) estimatedSnowCm *= 0.5

    const day = grouped.get(local.date) || {
      snowCm: 0,
      precipitationMm: 0,
      weightedTemp: 0,
      weight: 0,
      maxWind: null,
      explicitSnowPoints: 0,
    }
    day.snowCm += estimatedSnowCm
    day.precipitationMm += precipitation
    day.weightedTemp += temp * precipitation
    day.weight += precipitation
    day.maxWind = wind == null ? day.maxWind : Math.max(day.maxWind ?? wind, wind)
    if (explicitSnow) day.explicitSnowPoints += 1
    grouped.set(local.date, day)
  }

  for (const [date, day] of Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const meanTemp = day.weight > 0 ? day.weightedTemp / day.weight : null
    const powderEnough = day.snowCm >= 5
    const coldEnough = meanTemp != null && meanTemp <= 0.5
    const notTooWindy = day.maxWind == null || day.maxWind <= 15
    if (!powderEnough || !coldEnough || !notTooWindy) continue

    const mid = Math.max(1, Math.round(day.snowCm))
    const low = Math.max(1, Math.round(mid * 0.75))
    const high = Math.max(low, Math.round(mid * 1.25))
    return {
      found: true,
      date,
      estimated_fresh_cm_low: low,
      estimated_fresh_cm_high: high,
      estimated_fresh_cm_mid: mid,
      precipitation_mm: round1(day.precipitationMm),
      mean_snow_temp_c: round1(meanTemp),
      peak_wind_mps: round1(day.maxWind),
      elevation_m: elevationM == null ? null : Math.round(elevationM),
      basis,
      confidence: day.explicitSnowPoints > 0 ? 'medium' : 'low',
    }
  }

  return {
    found: false,
    date: null,
    estimated_fresh_cm_low: null,
    estimated_fresh_cm_high: null,
    estimated_fresh_cm_mid: null,
    precipitation_mm: null,
    mean_snow_temp_c: null,
    peak_wind_mps: null,
    elevation_m: elevationM == null ? null : Math.round(elevationM),
    basis,
    confidence: null,
  }
}

async function loadPowderForecastTimeseries(resort: any, fallback: any[]) {
  const resortLat = finiteNumber(resort?.forecast_lat)
  const resortLon = finiteNumber(resort?.forecast_lon)
  const elevation = finiteNumber(resort?.top_elevation_m)
  if (resortLat == null || resortLon == null || elevation == null) {
    return { timeseries: fallback, basis: 'selected_location' as const, elevationM: null }
  }

  const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact')
  url.searchParams.set('lat', String(roundCoordinate(resortLat)))
  url.searchParams.set('lon', String(roundCoordinate(resortLon)))
  url.searchParams.set('altitude', String(Math.round(elevation)))

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': MET_USER_AGENT },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return { timeseries: fallback, basis: 'selected_location' as const, elevationM: null }
    const payload = await response.json().catch(() => null)
    const timeseries = Array.isArray(payload?.properties?.timeseries) ? payload.properties.timeseries : []
    if (!timeseries.length) return { timeseries: fallback, basis: 'selected_location' as const, elevationM: null }
    return { timeseries, basis: 'resort_top' as const, elevationM: elevation }
  } catch {
    return { timeseries: fallback, basis: 'selected_location' as const, elevationM: null }
  }
}

'''
assert marker in route
route = route.replace(marker, insert + marker, 1)

old = """  const instant = point?.data?.instant?.details ?? {}\n  const nextHour = point?.data?.next_1_hours?.details ?? {}\n  const [snow, avalanche, resort] = await Promise.all([snowPromise, avalanchePromise, resortPromise])\n\n  return NextResponse.json({\n"""
new = """  const instant = point?.data?.instant?.details ?? {}\n  const nextHour = point?.data?.next_1_hours?.details ?? {}\n  const [snow, avalanche, resort] = await Promise.all([snowPromise, avalanchePromise, resortPromise])\n  const powderForecast = await loadPowderForecastTimeseries(resort, timeseries)\n  const nextPowderDay = estimateNextPowderDay(\n    powderForecast.timeseries,\n    powderForecast.basis,\n    powderForecast.elevationM\n  )\n\n  return NextResponse.json({\n"""
assert old in route
route = route.replace(old, new, 1)

old = """    snow,\n    avalanche,\n    resort,\n    forecast: compactForecast(timeseries),\n"""
new = """    snow,\n    avalanche,\n    resort,\n    next_powder_day: nextPowderDay,\n    forecast: compactForecast(timeseries),\n"""
assert old in route
route = route.replace(old, new, 1)

# Client type and display.
old = """    url: string | null\n    last_updated: string | null\n  }\n  forecast: Array<{\n"""
new = """    url: string | null\n    last_updated: string | null\n  }\n  next_powder_day: {\n    found: boolean\n    date: string | null\n    estimated_fresh_cm_low: number | null\n    estimated_fresh_cm_high: number | null\n    estimated_fresh_cm_mid: number | null\n    precipitation_mm: number | null\n    mean_snow_temp_c: number | null\n    peak_wind_mps: number | null\n    elevation_m: number | null\n    basis: 'resort_top' | 'selected_location'\n    confidence: 'medium' | 'low' | null\n  }\n  forecast: Array<{\n"""
assert old in home
home = home.replace(old, new, 1)

old = """  const avalanche = summary?.avalanche ?? null\n  const resort = summary?.resort ?? null\n"""
new = """  const avalanche = summary?.avalanche ?? null\n  const resort = summary?.resort ?? null\n  const powder = summary?.next_powder_day ?? null\n"""
assert old in home
home = home.replace(old, new, 1)

old = """                <div className=\"text-4xl font-medium tracking-[-0.04em] text-[color:var(--fg-95)]\">{mainLine}</div>\n                <div className=\"mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[color:var(--bd-10)] pt-5\">\n"""
new = """                <div className=\"text-4xl font-medium tracking-[-0.04em] text-[color:var(--fg-95)]\">{mainLine}</div>\n                <div className=\"mt-7 border-t border-[color:var(--bd-10)] pt-5\">\n                  <div className=\"text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]\">\n                    {isNo ? 'NESTE PUDDERDAG' : 'NEXT POWDER DAY'}\n                  </div>\n                  {powder?.found && powder.date ? (\n                    <>\n                      <div className=\"mt-1 text-xl font-semibold text-[color:var(--fg-95)]\">\n                        {skiForecastDayLabel(powder.date, language)} · {formatSkiMetric(powder.estimated_fresh_cm_low)}–{formatSkiMetric(powder.estimated_fresh_cm_high)} cm\n                      </div>\n                      <div className=\"mt-1 text-xs leading-5 text-[color:var(--fg-50)]\">\n                        {isNo ? 'Estimert nysnø' : 'Estimated fresh snow'}\n                        {powder.elevation_m != null ? ` · ~${formatSkiMetric(powder.elevation_m)} m` : ''}\n                        {powder.confidence === 'low' ? ` · ${isNo ? 'lav sikkerhet' : 'low confidence'}` : ''}\n                      </div>\n                    </>\n                  ) : (\n                    <div className=\"mt-1 text-lg text-[color:var(--fg-70)]\">\n                      {isNo ? 'Ingen pudderdag i prognosen' : 'No powder day in forecast'}\n                    </div>\n                  )}\n                </div>\n                <div className=\"mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[color:var(--bd-10)] pt-5\">\n"""
assert old in home
home = home.replace(old, new, 1)

old = """            <div className=\"flex items-end justify-between gap-4 px-1\">\n              <div>\n                <div className=\"text-[10px] uppercase tracking-[0.24em] text-[color:var(--fg-45)]\">{isNo ? 'NESTE UKE' : 'NEXT WEEK'}</div>\n                <div className=\"mt-1 text-xl font-semibold tracking-[-0.02em] text-[color:var(--fg-90)]\">{isNo ? 'Prognose' : 'Forecast'}</div>\n              </div>\n              <div className=\"text-xs text-[color:var(--fg-45)]\">MET Norway</div>\n            </div>\n"""
new = """            <div className=\"px-1\">\n              <div className=\"text-[10px] uppercase tracking-[0.24em] text-[color:var(--fg-45)]\">{isNo ? 'NESTE UKE' : 'NEXT WEEK'}</div>\n              <div className=\"mt-1 text-xl font-semibold tracking-[-0.02em] text-[color:var(--fg-90)]\">{isNo ? 'Prognose' : 'Forecast'}</div>\n            </div>\n"""
assert old in home
home = home.replace(old, new, 1)

route_path.write_text(route)
home_path.write_text(home)
print('patched powder day + forecast label')
