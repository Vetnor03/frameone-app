import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type RenderPostBody = {
  rendered_at?: string | null
}

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function parseRenderedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const iso = value.trim()
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as RenderPostBody
    const renderedAt = parseRenderedAt(body?.rendered_at) ?? new Date().toISOString()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('device_id, device_token')
      .eq('device_id', device_id)
      .maybeSingle()

    if (deviceError || !device || device.device_token !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('device_status')
      .upsert(
        {
          device_id,
          last_render_at: renderedAt,
        },
        { onConflict: 'device_id' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, device_id, last_render_at: renderedAt })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}
