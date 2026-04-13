import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type StatusPostBody = {
  device_id?: string
  current_version?: string | null
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
      .select('last_refresh_at, current_version')
      .eq('device_id', device_id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      device_id,
      last_refresh_at: data?.last_refresh_at ?? null,
      current_version: data?.current_version ?? null,
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
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}
