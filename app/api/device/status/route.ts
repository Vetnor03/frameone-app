import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type StatusPostBody = {
  device_id?: string
  current_version?: string | null
  battery_percent?: number | string | null
  battery_voltage?: number | string | null
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

    let data: {
      last_refresh_at?: string | null
      last_render_at?: string | null
      current_version?: string | null
      battery_percent?: number | null
      battery_voltage?: number | null
    } | null = null

    const withRender = await supabase
      .from('device_status')
      .select('last_refresh_at, last_render_at, current_version, battery_percent, battery_voltage')
      .eq('device_id', device_id)
      .maybeSingle()

    if (!withRender.error) {
      data = withRender.data
    } else {
      const withoutRender = await supabase
        .from('device_status')
        .select('last_refresh_at, current_version, battery_percent, battery_voltage')
        .eq('device_id', device_id)
        .maybeSingle()

      if (withoutRender.error) {
        return NextResponse.json({ error: withoutRender.error.message }, { status: 500 })
      }

      data = withoutRender.data
    }

    return NextResponse.json({
      device_id,
      last_refresh_at: data?.last_refresh_at ?? null,
      last_render_at: data?.last_render_at ?? null,
      current_version: data?.current_version ?? null,
      battery_percent: data?.battery_percent ?? null,
      battery_voltage: data?.battery_voltage ?? null,
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

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const payload = {
      device_id,
      last_refresh_at: new Date().toISOString(),
      current_version,
      battery_percent,
      battery_voltage,
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
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}
