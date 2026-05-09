import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { spotIdFromLabel } from '@/app/lib/surf/spots'

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
  swellDirectionDeg?: number
  windDirectionDeg?: number
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
  const n = asNumber(value)
  if (n == null) return '--°'
  return `${Math.round(n)}°${units === 'imperial' ? 'F' : 'C'}`
}

function formatPrice(value: unknown, currency: string) {
  const n = asNumber(value)
  if (n == null) return '--'
  const digits = Math.abs(n) >= 100 ? 2 : 2
  return `${currency} ${n.toFixed(digits)}`
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

async function weatherDetail(cfg: UnknownRecord, language: string): Promise<Detail> {
  const lat = asNumber(cfg.lat)
  const lon = asNumber(cfg.lon)
  const label = asString(cfg.label).trim()
  const units = asString(cfg.units, 'metric').toLowerCase() === 'imperial' ? 'imperial' : 'metric'
  if (lat == null || lon == null) return { primary: 'WEATHER', secondary: label || (language === 'no' ? 'Lagret sted' : 'Saved location') }

  const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius'
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', 'temperature_2m,weather_code,relative_humidity_2m')
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set('temperature_unit', tempUnit)

  const data = asRecord(await fetchJson(url.toString()))
  const current = asRecord(data.current)
  const daily = asRecord(data.daily)
  const mins = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : []
  const maxs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : []

  return {
    primary: formatTemp(current.temperature_2m, units),
    secondary: label || (language === 'no' ? 'Vær' : 'Weather'),
    tertiary: `${formatTemp(mins[0], units)} / ${formatTemp(maxs[0], units)}`,
  }
}

async function surfDetail(origin: string, cfg: UnknownRecord, bearer: string, language: string): Promise<Detail> {
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
  url.searchParams.set('hours', '24')

  const data = asRecord(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${bearer}` } }))
  const forecast = asRecord(data.forecast)
  const inputs = asRecord(data.inputs)
  const rating = asNumber(data.rating) ?? asNumber(data.score) ?? undefined
  const waveRange = asString(forecast.wave_height_range_label || data.line1 || data.line2, '')

  return {
    module: 'surf',
    primary: String(rating ?? '--'),
    secondary: asString(data.spot, spot || (language === 'no' ? 'Surf' : 'Surf')),
    tertiary: waveRange,
    rating,
    waveRange,
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

async function remindersDetail(origin: string, deviceId: string, deviceToken: string, language: string): Promise<Detail> {
  const url = new URL('/api/device/reminders', origin)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('limit', '3')
  const data = asRecord(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${deviceToken}` } }))
  const items = Array.isArray(data.items) ? data.items.map(asRecord) : []
  const first = items[0]
  return {
    primary: first ? asString(first.title, language === 'no' ? 'Påminnelse' : 'Reminder') : (language === 'no' ? 'Ingen' : 'None'),
    secondary: language === 'no' ? 'Påminnelser' : 'Reminders',
    tertiary: first ? asString(first.display_date || first.display_time, '') : undefined,
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

  const { data, error } = await supabase
    .from('grocery_items')
    .select('name, quantity, updated_at')
    .in('device_id', storageDeviceIds)
    .eq('is_checked', false)
    .order('updated_at', { ascending: false })
    .limit(40)

  if (error) throw new Error(error.message)

  const items = Array.isArray(data) ? data.map(asRecord) : []
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

    const [{ data: settingsRow, error: settingsError }, { data: deviceRow, error: deviceError }] = await Promise.all([
      supabase.from('device_settings').select('settings_json, updated_at').eq('device_id', deviceId).maybeSingle(),
      supabase.from('devices').select('device_token').eq('device_id', deviceId).maybeSingle(),
    ])
    if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 })
    if (deviceError) return NextResponse.json({ error: deviceError.message }, { status: 500 })

    const settings = asRecord(settingsRow?.settings_json)
    const modules = asRecord(settings.modules)
    const cells = Array.isArray(settings.cells) ? settings.cells.map(asRecord) : []
    const language = asString(settings.language, 'en') === 'no' ? 'no' : 'en'
    const origin = appOrigin(req)
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
        else if (parsed.base === 'surf') detailsBySlot[String(slot)] = await surfDetail(origin, cfg, bearer, language)
        else if (parsed.base === 'soccer') detailsBySlot[String(slot)] = await soccerDetail(origin, cfg, language)
        else if (parsed.base === 'stocks' && deviceToken) detailsBySlot[String(slot)] = await stocksDetail(origin, deviceId, deviceToken, parsed.id, cfg)
        else if (parsed.base === 'reminders' && deviceToken) detailsBySlot[String(slot)] = await remindersDetail(origin, deviceId, deviceToken, language)
        else if (parsed.base === 'groceries') detailsBySlot[String(slot)] = await groceriesDetail(supabase, deviceId, language)
        else if (parsed.base === 'countdown') detailsBySlot[String(slot)] = { primary: asString(cfg.title || cfg.name, 'COUNTDOWN'), secondary: language === 'no' ? 'Nedtelling' : 'Countdown' }
      } catch {
        // Leave this slot to the client-side config fallback if live data is unavailable.
      }
    }))

    return NextResponse.json({ device_id: deviceId, updated_at: settingsRow?.updated_at ?? null, detailsBySlot })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
