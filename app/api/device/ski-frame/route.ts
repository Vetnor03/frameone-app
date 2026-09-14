import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UnknownRecord = Record<string, unknown>
type SkiConfig = { id?: number | string; label?: string; name?: string; lat?: number | string; latitude?: number | string; lon?: number | string; longitude?: number | string }

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function bearer(req: Request) {
  const match = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function finite(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

async function canReadDevice(supabase: SupabaseClient, deviceId: string, token: string) {
  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('device_id, device_token')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (deviceError || !device) return false
  if (device.device_token && device.device_token === token) return true

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) return false

  const { data: member, error: memberError } = await supabase
    .from('device_members')
    .select('device_id')
    .eq('device_id', deviceId)
    .eq('user_id', authData.user.id)
    .maybeSingle()

  return !memberError && Boolean(member)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const deviceId = String(url.searchParams.get('device_id') || '').trim()
    const id = Number(url.searchParams.get('id') || '1')
    const token = bearer(req)

    if (!deviceId) return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    if (!Number.isInteger(id) || id < 1 || id > 255) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRole) return NextResponse.json({ error: 'Server configuration unavailable' }, { status: 500 })

    const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
    if (!(await canReadDevice(supabase, deviceId, token))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('device_settings')
      .select('settings_json')
      .eq('device_id', deviceId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const settings = record(data?.settings_json)
    const modules = record(settings.modules)
    const ski = Array.isArray(modules.ski) ? modules.ski as SkiConfig[] : []
    const cfg = ski.find((item) => Number(item?.id ?? 1) === id)
    if (!cfg) return NextResponse.json({ error: 'Ski config not found' }, { status: 404 })

    const lat = finite(cfg.lat ?? cfg.latitude)
    const lon = finite(cfg.lon ?? cfg.longitude)
    if (lat == null || lon == null) return NextResponse.json({ error: 'Ski location missing coordinates' }, { status: 404 })

    const label = String(cfg.label ?? cfg.name ?? 'Ski').trim().slice(0, 80) || 'Ski'
    const language = String(settings.language || 'en') === 'no' ? 'no' : 'en'
    const summaryUrl = new URL('/api/ski/summary', req.url)
    summaryUrl.searchParams.set('lat', String(lat))
    summaryUrl.searchParams.set('lon', String(lon))
    summaryUrl.searchParams.set('label', label)
    summaryUrl.searchParams.set('lang', language)

    const response = await fetch(summaryUrl, { cache: 'no-store' })
    const summary = await response.json().catch(() => null)
    if (!response.ok || !summary || typeof summary !== 'object') {
      return NextResponse.json({ error: 'Ski summary unavailable' }, { status: response.ok ? 502 : response.status })
    }

    const source = summary as UnknownRecord
    const location = record(source.location)
    const current = record(source.current)
    const snow = record(source.snow)
    const avalanche = record(source.avalanche)
    const dangerLevel = finite(avalanche.danger_level)
    const assessed = avalanche.assessed === true && dangerLevel != null && dangerLevel > 0

    return NextResponse.json({
      module_id: id,
      location: { label: String(location.label ?? label).trim().slice(0, 80) || label },
      current: {
        temp_c: finite(current.temp_c),
        wind_mps: finite(current.wind_mps),
        wind_dir_deg: finite(current.wind_dir_deg),
      },
      snow: {
        fresh_24h_cm: finite(snow.fresh_24h_cm),
        snow_depth_cm: finite(snow.snow_depth_cm),
      },
      avalanche: {
        available: avalanche.available === true,
        assessed,
        danger_level: assessed ? dangerLevel : dangerLevel === 0 ? 0 : null,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
