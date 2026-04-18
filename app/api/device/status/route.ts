import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type StatusPostBody = {
  device_id?: string
  current_version?: string | null
  battery_percent?: number | string | null
  battery_voltage?: number | string | null
  is_charging?: boolean | string | number | null
  did_render?: boolean | string | number | null
}

function parseBatteryPercent(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null

  const rounded = Math.round(n)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

function parseBatteryVoltage(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n < 0) return null
  return Number(n.toFixed(3))
}

function parseBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  return null
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('device_status')
      .select('current_version, battery_percent, battery_voltage, is_charging, last_seen_at, last_render_at, last_refresh_at')
      .eq('device_id', device_id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      device_id,
      current_version: data?.current_version ?? null,
      battery_percent: data?.battery_percent ?? null,
      battery_voltage: data?.battery_voltage ?? null,
      is_charging: parseBoolean(data?.is_charging),
      last_seen_at: data?.last_seen_at ?? data?.last_refresh_at ?? null,
      last_render_at: data?.last_render_at ?? data?.last_refresh_at ?? null,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StatusPostBody

    const device_id = String(body?.device_id ?? '').trim()
    const current_versionRaw = String(body?.current_version ?? '').trim()
    const current_version = current_versionRaw || null
    const battery_percent = parseBatteryPercent(body?.battery_percent)
    const battery_voltage = parseBatteryVoltage(body?.battery_voltage)
    const is_charging = parseBoolean(body?.is_charging)
    const did_render = parseBoolean(body?.did_render)

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const nowIso = new Date().toISOString()

    const payload: Record<string, string | number | boolean | null> = {
      device_id,
      current_version,
      battery_percent,
      battery_voltage,
      is_charging,
      last_seen_at: nowIso,
    }

    if (did_render === true) {
      payload.last_render_at = nowIso
      // Keep this for backwards compatibility with older consumers still reading last_refresh_at.
      payload.last_refresh_at = nowIso
    }

    const { error } = await supabase
      .from('device_status')
      .upsert(payload, { onConflict: 'device_id' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      device_id,
      current_version,
      battery_percent,
      battery_voltage,
      is_charging,
      did_render: did_render === true,
      last_seen_at: nowIso,
      last_render_at: did_render === true ? nowIso : null,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}
