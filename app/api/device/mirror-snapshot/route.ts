import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { spotIdFromLabel } from '@/app/lib/surf/spots'
import { buildMediumWeatherDetail, formatWeatherTemp, normalizeDisplayWmoForTemps } from '@/app/lib/weatherMirror'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Detail = {
  primary: string
  secondary?: string
  tertiary?: string
  module?: string
  rating?: number
  waveRange?: string
  swellPeriodS?: number
  windSpeedMs?: number
  isTodaysBest?: boolean
  isExperienceBased?: boolean
  ratingFromExperience?: boolean
  swellDirectionDeg?: number
  windDirectionDeg?: number
  groceryItems?: string[]
  reminderItems?: string[]
  reminderHeader?: string
  dinnerTodayTitle?: string
  weatherLowTemp?: string
  weatherHighTemp?: string
  weatherAdvice?: string
  weatherWindLine?: string
  weatherPrecipLine?: string
  weatherWmo?: number | null
}
type UnknownRecord = Record<string, unknown>

const MODULES = new Set(['date', 'weather', 'surf', 'reminders', 'countdown', 'soccer', 'stocks', 'groceries'])

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

function splitStoredModule(value: unknown) {
  const raw = String(value ?? '').trim()
  const [baseRaw, idRaw] = raw.split(':', 2)
  const base = baseRaw.toLowerCase()
  if (!MODULES.has(base)) return null
  const id = Math.max(1, Math.round(Number(idRaw || 1)) || 1)
  return { raw, base, id }
}

function moduleConfig(modules: UnknownRecord, base: string, id: number) {
  const raw = modules[base]
  if (Array.isArray(raw)) {
    const exact = raw.find((item) => Number(asRecord(item).id) === id)
    return asRecord(exact ?? raw[id - 1])
  }
  return asRecord(raw)
}

function formatTemp(value: unknown, units: string) {
  return formatWeatherTemp(value, units === 'imperial' ? 'imperial' : 'metric')
}

function formatPrice(value: unknown, currency: string) {
  const n = asNumber(value)
  if (n == null) return '--'
  const digits = Math.abs(n) >= 100 ? 2 : 2
  return `${currency} ${n.toFixed(digits)}`
}


function truthy(value: unknown) {
  if (value === true) return true
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
  return false
}

function isSurfScoreExperienceBased(payload: UnknownRecord) {
  const breakdown = asRecord(payload.breakdown)
  const experience = asRecord(breakdown.experience)
  const topExperience = asRecord(payload.experience)
  const picked = asRecord(payload.picked)
  const pickedBreakdown = asRecord(picked.breakdown)
  const pickedExperience = asRecord(picked.experience)
  const source = asString(payload.ratingSource || payload.source).toLowerCase()

  return (
    truthy(payload.isExperienceBased) ||
    truthy(payload.ratingFromExperience) ||
    truthy(payload.basedOnExperience) ||
    source.includes('experience') ||
    source.includes('user_surf_experiences') ||
    truthy(experience.matched) ||
    truthy(experience.isExperienceBased) ||
    truthy(topExperience.matched) ||
    truthy(pickedExperience.matched) ||
    truthy(asRecord(pickedBreakdown.experience).matched)
  )
}

function formatPercent(value: unknown) {
  const n = asNumber(value)
  if (n == null) return null
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function formatDate(language: string) {
  return new Intl.DateTimeFormat(language === 'no' ? 'nb-NO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date())
}

function appOrigin(req: Request) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

async function fetchJson(url: string, init?: RequestInit) {
  const resp = await fetch(url, { ...init, cache: 'no-store' })
  if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`)
  return resp.json() as Promise<unknown>
}

function arrayNumberAt(values: unknown, index: number): number | null {
  return Array.isArray(values) ? asNumber(values[index]) : null
}

function arrayStringAt(values: unknown, index: number): string {
  return Array.isArray(values) ? asString(values[index]) : ''
}

function hhmmFromIso(value: string) {
  const match = /T(\d{2}:\d{2})/.exec(value)
  return match ? match[1] : ''
}

function wmoSeverityRank(wmo: number) {
  if (wmo === 95 || wmo === 96 || wmo === 99) return 90
  if ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86) return 100
  if (wmo === 66 || wmo === 67) return 85
  if ((wmo >= 51 && wmo <= 65) || (wmo >= 80 && wmo <= 82)) return 80
  if (wmo === 45 || wmo === 48) return 60
  if (wmo === 3) return 40
  if (wmo === 1 || wmo === 2) return 30
  if (wmo === 0) return 10
  return 20
}

function isPrecipWmo(wmo: number) {
  return (
    (wmo >= 51 && wmo <= 67) ||
    (wmo >= 71 && wmo <= 77) ||
    (wmo >= 80 && wmo <= 82) ||
    wmo === 85 ||
    wmo === 86 ||
    wmo === 95 ||
    wmo === 96 ||
    wmo === 99
  )
}

type WmoCount = { wmo: number; count: number }

function chooseDominantWmo(counts: WmoCount[], fallbackWmo: number | null, precipMm: number | null) {
  let chosen = fallbackWmo

  if (counts.length > 0) {
    let best = counts[0]
    let bestRank = wmoSeverityRank(best.wmo)

    for (const item of counts.slice(1)) {
      const rank = wmoSeverityRank(item.wmo)
      if (item.count > best.count || (item.count === best.count && rank > bestRank)) {
        best = item
        bestRank = rank
      }
    }
    chosen = best.wmo

    if (precipMm != null && precipMm > 2.0) {
      let precipBest: WmoCount | null = null
      let precipBestRank = -1

      for (const item of counts) {
        if (!isPrecipWmo(item.wmo)) continue
        const rank = wmoSeverityRank(item.wmo)
        if (precipBest == null || item.count > precipBest.count || (item.count === precipBest.count && rank > precipBestRank)) {
          precipBest = item
          precipBestRank = rank
        }
      }

      if (precipBest) chosen = precipBest.wmo
    }
  }

  return chosen
}

function addWmoCount(counts: WmoCount[], wmo: number) {
  const existing = counts.find((item) => item.wmo === wmo)
  if (existing) existing.count += 1
  else counts.push({ wmo, count: 1 })
}

function localHourFromIso(value: string) {
  const match = /T(\d{2})/.exec(value)
  return match ? Number(match[1]) : null
}

function computeSelectedWeatherPeriods(data: UnknownRecord, fallbackFullDay: {
  hiC: number | null
  loC: number | null
  windMaxMs: number | null
  precipMm: number | null
  wmo: number | null
}) {
  const current = asRecord(data.current)
  const hourly = asRecord(data.hourly)
  const currentTime = asString(current.time)
  const currentDate = currentTime.slice(0, 10)
  const currentHour = localHourFromIso(currentTime)
  const times = Array.isArray(hourly.time) ? hourly.time : []

  if (currentDate.length < 10) {
    const normalizedWmo = normalizeDisplayWmoForTemps(fallbackFullDay.wmo, fallbackFullDay.loC, fallbackFullDay.hiC)
    return {
      ...fallbackFullDay,
      wmo: normalizedWmo,
      restValid: false,
      restHiC: fallbackFullDay.hiC,
      restLoC: fallbackFullDay.loC,
      restWindMaxMs: fallbackFullDay.windMaxMs,
      restPrecipMm: fallbackFullDay.precipMm,
      restWmo: normalizedWmo,
    }
  }

  let hiC: number | null = null
  let loC: number | null = null
  let windMaxMs: number | null = null
  let precipMm = 0
  let sawPrecip = false
  let sawFullDay = false
  const wmoCounts: WmoCount[] = []

  let restHiC: number | null = null
  let restLoC: number | null = null
  let restWindMaxMs: number | null = null
  let restPrecipMm = 0
  let sawRestPrecip = false
  let sawRestToday = false
  const restWmoCounts: WmoCount[] = []

  times.forEach((rawTime, index) => {
    const time = asString(rawTime)
    if (!time.startsWith(currentDate)) return
    const hour = localHourFromIso(time)
    if (hour == null || hour < 0 || hour >= 24) return

    const temp = arrayNumberAt(hourly.temperature_2m, index)
    if (temp != null) {
      hiC = hiC == null ? temp : Math.max(hiC, temp)
      loC = loC == null ? temp : Math.min(loC, temp)
    }

    const wind = arrayNumberAt(hourly.wind_speed_10m, index)
    if (wind != null) windMaxMs = windMaxMs == null ? wind : Math.max(windMaxMs, wind)

    const precip = arrayNumberAt(hourly.precipitation, index)
    if (precip != null) {
      sawPrecip = true
      if (precip > 0) precipMm += precip
    }

    const wmo = arrayNumberAt(hourly.weather_code, index)
    if (wmo != null) addWmoCount(wmoCounts, Math.round(wmo))
    sawFullDay = true

    const isRestOfToday = currentHour != null && hour >= currentHour
    if (!isRestOfToday) return

    if (temp != null) {
      restHiC = restHiC == null ? temp : Math.max(restHiC, temp)
      restLoC = restLoC == null ? temp : Math.min(restLoC, temp)
    }

    if (wind != null) restWindMaxMs = restWindMaxMs == null ? wind : Math.max(restWindMaxMs, wind)

    if (precip != null) {
      sawRestPrecip = true
      if (precip > 0) restPrecipMm += precip
    }

    if (wmo != null) addWmoCount(restWmoCounts, Math.round(wmo))
    sawRestToday = true
  })

  const selectedHiC = sawFullDay && hiC != null ? hiC : fallbackFullDay.hiC
  const selectedLoC = sawFullDay && loC != null ? loC : fallbackFullDay.loC
  const selectedWindMaxMs = sawFullDay && windMaxMs != null ? windMaxMs : fallbackFullDay.windMaxMs
  const selectedPrecipMm = sawFullDay && sawPrecip ? precipMm : fallbackFullDay.precipMm
  const selectedWmo = normalizeDisplayWmoForTemps(
    chooseDominantWmo(wmoCounts, fallbackFullDay.wmo, selectedPrecipMm),
    selectedLoC,
    selectedHiC,
  )

  const restSelectedHiC = sawRestToday && restHiC != null ? restHiC : selectedHiC
  const restSelectedLoC = sawRestToday && restLoC != null ? restLoC : selectedLoC
  const restSelectedWindMaxMs = sawRestToday && restWindMaxMs != null ? restWindMaxMs : selectedWindMaxMs
  const restSelectedPrecipMm = sawRestToday && sawRestPrecip ? restPrecipMm : selectedPrecipMm
  const restSelectedWmo = normalizeDisplayWmoForTemps(
    chooseDominantWmo(restWmoCounts, selectedWmo, restSelectedPrecipMm),
    restSelectedLoC,
    restSelectedHiC,
  )

  return {
    hiC: selectedHiC,
    loC: selectedLoC,
    windMaxMs: selectedWindMaxMs,
    precipMm: selectedPrecipMm,
    wmo: selectedWmo,
    restValid: sawRestToday,
    restHiC: restSelectedHiC,
    restLoC: restSelectedLoC,
    restWindMaxMs: restSelectedWindMaxMs,
    restPrecipMm: restSelectedPrecipMm,
    restWmo: restSelectedWmo,
  }
}

async function weatherDetail(cfg: UnknownRecord, language: string): Promise<Detail> {
  const lat = asNumber(cfg.lat)
  const lon = asNumber(cfg.lon)
  const label = asString(cfg.label).trim()
  const units = asString(cfg.units, 'metric').toLowerCase() === 'imperial' ? 'imperial' : 'metric'
  const showHiLo = cfg.hiLo == null ? true : truthy(cfg.hiLo)
  if (lat == null || lon == null) return { primary: 'WEATHER', secondary: label || (language === 'no' ? 'Lagret sted' : 'Saved location') }

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', 'temperature_2m,weather_code,relative_humidity_2m')
  url.searchParams.set('hourly', 'temperature_2m,weather_code,wind_speed_10m,precipitation')
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max,sunrise,sunset')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('temperature_unit', 'celsius')
  url.searchParams.set('wind_speed_unit', 'ms')
  url.searchParams.set('precipitation_unit', 'mm')
  url.searchParams.set('timezone', 'auto')

  const data = asRecord(await fetchJson(url.toString()))
  const current = asRecord(data.current)
  const daily = asRecord(data.daily)
  const currentTempC = asNumber(current.temperature_2m)
  const hiC = arrayNumberAt(daily.temperature_2m_max, 0)
  const loC = arrayNumberAt(daily.temperature_2m_min, 0)
  const windMaxMs = arrayNumberAt(daily.wind_speed_10m_max, 0)
  const precipMm = arrayNumberAt(daily.precipitation_sum, 0)
  const wmo = arrayNumberAt(daily.weather_code, 0)
  const currentTime = asString(current.time)
  const sunriseHHMM = hhmmFromIso(arrayStringAt(daily.sunrise, 0))
  const sunsetHHMM = hhmmFromIso(arrayStringAt(daily.sunset, 0))
  const selectedPeriods = computeSelectedWeatherPeriods(data, { hiC, loC, windMaxMs, precipMm, wmo })
  const medium = buildMediumWeatherDetail({
    units,
    showHiLo,
    currentTempC,
    ...selectedPeriods,
    sunriseHHMM,
    sunsetHHMM,
    localHour: localHourFromIso(currentTime),
  })

  return {
    primary: formatTemp(currentTempC, units),
    secondary: label || (language === 'no' ? 'Vær' : 'Weather'),
    tertiary: `${formatTemp(loC, units)} / ${formatTemp(hiC, units)}`,
    ...medium,
  }
}

async function surfDetail(
  origin: string,
  cfg: UnknownRecord,
  bearer: string,
  language: string,
  surfSettings: UnknownRecord
): Promise<Detail> {
  const spot = asString(cfg.spot || cfg.label).trim()
  const configuredSpotId = asString(cfg.spotId).trim()
  const spotId = configuredSpotId || (spot ? spotIdFromLabel(spot) ?? '' : '')
  const lat = asNumber(cfg.lat)
  const lon = asNumber(cfg.lon)
  const url = new URL('/api/surf/score', origin)
  if (spotId && spotId !== '__todays_best__') url.searchParams.set('spotId', spotId)
  else if (spot) url.searchParams.set('spot', spot)
  if (lat != null) url.searchParams.set('lat', String(lat))
  if (lon != null) url.searchParams.set('lon', String(lon))
  // Match the physical frame firmware, which asks for the best surf in the next 4 hours.
  url.searchParams.set('hours', '4')

  if (spotId === '__todays_best__') {
    const fuelPenalty = truthy(surfSettings.fuelPenalty)
    const homeLat = asNumber(surfSettings.homeLat)
    const homeLon = asNumber(surfSettings.homeLon)
    url.searchParams.set('fuelPenalty', fuelPenalty ? '1' : '0')
    if (fuelPenalty && homeLat != null && homeLon != null && homeLat !== 0 && homeLon !== 0) {
      url.searchParams.set('homeLat', String(homeLat))
      url.searchParams.set('homeLon', String(homeLon))
    }
  }

  const data = asRecord(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${bearer}` } }))
  const forecast = asRecord(data.forecast)
  const inputs = asRecord(data.inputs)
  const rating = asNumber(data.rating) ?? asNumber(data.score) ?? undefined
  const waveRange = asString(forecast.wave_height_range_label || data.line1 || data.line2, '')
  const isExperienceBased = isSurfScoreExperienceBased(data)

  return {
    module: 'surf',
    primary: String(rating ?? '--'),
    secondary: asString(data.spot, spot || (language === 'no' ? 'Surf' : 'Surf')),
    tertiary: waveRange,
    rating,
    waveRange,
    isExperienceBased,
    ratingFromExperience: isExperienceBased,
    swellPeriodS: asNumber(inputs.swell_period_s) ?? undefined,
    windSpeedMs: asNumber(inputs.wind_speed_ms) ?? undefined,
    swellDirectionDeg: asNumber(inputs.swell_direction_deg) ?? undefined,
    windDirectionDeg: asNumber(inputs.wind_direction_deg) ?? undefined,
    isTodaysBest: spotId === '__todays_best__',
  }
}

async function soccerDetail(origin: string, cfg: UnknownRecord, language: string): Promise<Detail> {
  const teamId = asString(cfg.teamId).trim()
  const teamName = asString(cfg.teamName || cfg.team).trim()
  if (!teamId) return { primary: teamName || 'SOCCER', secondary: language === 'no' ? 'Lagret lag' : 'Saved team' }
  const url = new URL('/api/soccer/frame', origin)
  url.searchParams.set('teamId', teamId)
  const data = asRecord(await fetchJson(url.toString()))
  const next = asRecord(data.next)
  const standing = asRecord(data.standing)
  const position = asNumber(standing.position)
  return {
    primary: teamName || asString(data.teamKey, 'SOCCER'),
    secondary: next.homeShort && next.awayShort ? `${next.homeShort} - ${next.awayShort}` : asString(data.competitionName, ''),
    tertiary: position != null ? `#${position}` : undefined,
  }
}

async function stocksDetail(origin: string, deviceId: string, deviceToken: string, id: number, cfg: UnknownRecord): Promise<Detail> {
  const symbol = asString(cfg.symbol).trim().toUpperCase()
  const url = new URL('/api/device/stocks', origin)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('id', String(id))
  const data = asRecord(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${deviceToken}` } }))
  const quote = asRecord(data.quote)
  const pct = formatPercent(quote.changePercent)
  return {
    primary: formatPrice(quote.price, asString(data.currency, 'USD')),
    secondary: asString(data.symbol, symbol),
    tertiary: pct ?? undefined,
  }
}


function formatReminderMirrorHeader(item: UnknownRecord | undefined, language: string) {
  if (!item) return language === 'no' ? 'PÅMINNELSER' : 'REMINDERS'

  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const daysUntil = asNumber(item.days_until)
  const occurrenceYmd = asString(item.occurrence_date).trim()

  if (daysUntil === 0) return language === 'no' ? 'I DAG' : 'TODAY'
  if (daysUntil === 1) return language === 'no' ? 'I MORGEN' : 'TOMORROW'

  if (occurrenceYmd) {
    const date = new Date(`${occurrenceYmd}T12:00:00`)
    if (!Number.isNaN(date.getTime())) {
      if (daysUntil != null && daysUntil > 1 && daysUntil <= 14) {
        const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
        const prefix = language === 'no' ? 'NESTE' : 'NEXT'
        return `${prefix} ${weekday}`.toLocaleUpperCase(locale)
      }

      return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
      }).format(date).replace('.', '').toLocaleUpperCase(locale)
    }
  }

  const displayDate = asString(item.display_date).trim()
  return displayDate ? displayDate.toLocaleUpperCase(locale) : (language === 'no' ? 'PÅMINNELSER' : 'REMINDERS')
}

async function remindersDetail(origin: string, deviceId: string, deviceToken: string, language: string): Promise<Detail> {
  const url = new URL('/api/device/reminders', origin)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('limit', '20')
  const data = asRecord(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${deviceToken}` } }))
  const items = Array.isArray(data.items) ? data.items.map(asRecord) : []
  const first = items[0]
  const firstOccurrenceDate = first ? asString(first.occurrence_date).trim() : ''
  const visibleItems = firstOccurrenceDate
    ? items.filter((item) => asString(item.occurrence_date).trim() === firstOccurrenceDate).slice(0, 3)
    : items.slice(0, 3)
  const reminderItems = visibleItems
    .map((item) => {
      const title = asString(item.title).trim()
      const displayTime = asString(item.display_time).trim()
      if (!title) return ''
      return displayTime ? `${title} ${displayTime}` : title
    })
    .filter(Boolean)
  return {
    primary: first ? asString(first.title, language === 'no' ? 'Påminnelse' : 'Reminder') : (language === 'no' ? 'Ingen' : 'None'),
    secondary: language === 'no' ? 'Påminnelser' : 'Reminders',
    tertiary: first ? asString(first.display_date || first.display_time, '') : undefined,
    reminderItems,
    reminderHeader: formatReminderMirrorHeader(first, language),
  }
}

async function groceriesDetail(supabase: SupabaseClient, deviceId: string, language: string): Promise<Detail> {
  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('device_id', deviceId)
    .maybeSingle()

  const appStorageDeviceId = String((device as Record<string, unknown> | null)?.id ?? '').trim()
  const storageDeviceIds = Array.from(new Set([appStorageDeviceId, deviceId].filter(Boolean)))

  const todayIso = isoDateOnly(new Date())

  const [itemsResult, dinnerResult] = await Promise.all([
    supabase
      .from('grocery_items')
      .select('name, quantity, updated_at')
      .in('device_id', storageDeviceIds)
      .eq('is_checked', false)
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase
      .from('dinner_plan_days')
      .select('title')
      .in('device_id', storageDeviceIds)
      .eq('date', todayIso)
      .limit(1),
  ])

  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (dinnerResult.error) throw new Error(dinnerResult.error.message)

  const items = Array.isArray(itemsResult.data) ? itemsResult.data.map(asRecord) : []
  const dinnerRows = Array.isArray(dinnerResult.data) ? dinnerResult.data.map(asRecord) : []
  const dinnerTodayTitle = asString(dinnerRows[0]?.title).trim()
  const groceryItems = items
    .map((item) => {
      const name = asString(item.name).trim()
      const quantity = asNumber(item.quantity) ?? 1
      return quantity > 1 ? `${quantity}x ${name}` : name
    })
    .filter(Boolean)
  const preview = items
    .slice(0, 2)
    .map((item) => {
      const name = asString(item.name).trim()
      const quantity = asNumber(item.quantity) ?? 1
      return quantity > 1 ? `${name} ×${quantity}` : name
    })
    .filter(Boolean)
    .join(', ')

  return {
    primary: items.length ? `${items.length}` : '0',
    secondary: language === 'no' ? 'varer' : 'items',
    tertiary: preview,
    groceryItems,
    dinnerTodayTitle: dinnerTodayTitle || undefined,
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const deviceId = url.searchParams.get('device_id')?.trim()
    if (!deviceId) return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })

    const bearer = getBearerToken(req)
    if (!bearer) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: authData, error: authError } = await supabase.auth.getUser(bearer)
    if (authError || !authData.user) return NextResponse.json({ error: 'Invalid user token' }, { status: 401 })

    const { data: member, error: memberError } = await supabase
      .from('device_members')
      .select('device_id')
      .eq('device_id', deviceId)
      .eq('user_id', authData.user.id)
      .maybeSingle()
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
    if (!member) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const [{ data: deviceRow, error: deviceError }, { data: statusRow, error: statusError }] = await Promise.all([
      supabase.from('devices').select('device_token').eq('device_id', deviceId).maybeSingle(),
      supabase
        .from('device_status')
        .select('current_version, battery_percent, battery_voltage, is_charging, is_usb_present, last_seen_at, last_render_at, last_refresh_at')
        .eq('device_id', deviceId)
        .maybeSingle(),
    ])
    if (deviceError) return NextResponse.json({ error: deviceError.message }, { status: 500 })
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 })

    const origin = appOrigin(req)
    const frameConfig = asRecord(await fetchJson(`${origin}/api/device/frame-config?device_id=${encodeURIComponent(deviceId)}`))
    const settings = asRecord(frameConfig.settings_json)
    const modules = asRecord(settings.modules)
    const cells = Array.isArray(settings.cells) ? settings.cells.map(asRecord) : []
    const language = asString(settings.language, 'en') === 'no' ? 'no' : 'en'
    const deviceToken = asString(deviceRow?.device_token)
    const detailsBySlot: Record<string, Detail> = {}

    await Promise.all(cells.map(async (cell) => {
      const slot = Number(cell.slot)
      if (!Number.isFinite(slot)) return
      const parsed = splitStoredModule(cell.module)
      if (!parsed) return
      const cfg = moduleConfig(modules, parsed.base, parsed.id)

      try {
        if (parsed.base === 'date') detailsBySlot[String(slot)] = { primary: formatDate(language), secondary: language === 'no' ? 'Dato' : 'Date' }
        else if (parsed.base === 'weather') detailsBySlot[String(slot)] = await weatherDetail(cfg, language)
        else if (parsed.base === 'surf') detailsBySlot[String(slot)] = await surfDetail(origin, cfg, bearer, language, asRecord(modules.surf_settings))
        else if (parsed.base === 'soccer') detailsBySlot[String(slot)] = await soccerDetail(origin, cfg, language)
        else if (parsed.base === 'stocks' && deviceToken) detailsBySlot[String(slot)] = await stocksDetail(origin, deviceId, deviceToken, parsed.id, cfg)
        else if (parsed.base === 'reminders' && deviceToken) detailsBySlot[String(slot)] = await remindersDetail(origin, deviceId, deviceToken, language)
        else if (parsed.base === 'groceries') detailsBySlot[String(slot)] = await groceriesDetail(supabase, deviceId, language)
        else if (parsed.base === 'countdown') detailsBySlot[String(slot)] = { primary: asString(cfg.title || cfg.name, 'COUNTDOWN'), secondary: language === 'no' ? 'Nedtelling' : 'Countdown' }
      } catch {
        // Leave this slot to the client-side config fallback if live data is unavailable.
      }
    }))

    return NextResponse.json({
      device_id: deviceId,
      updated_at: frameConfig.updated_at ?? null,
      settings_json: settings,
      detailsBySlot,
      status: {
        current_version: statusRow?.current_version ?? null,
        battery_percent: statusRow?.battery_percent ?? null,
        battery_voltage: statusRow?.battery_voltage ?? null,
        is_charging: statusRow?.is_charging ?? null,
        is_usb_present: statusRow?.is_usb_present ?? null,
        last_seen_at: statusRow?.last_seen_at ?? statusRow?.last_refresh_at ?? null,
        last_render_at: statusRow?.last_render_at ?? statusRow?.last_refresh_at ?? null,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
