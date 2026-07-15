import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildFrameConfigPayload } from '../frame-config/builder'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')
    if (!device_id) return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const payload = await buildFrameConfigPayload(supabase, device_id)
    return NextResponse.json({
      device_id,
      updated_at: 'updated_at' in payload ? payload.updated_at : null,
      compatible_revision: 'compatible_revision' in payload ? payload.compatible_revision ?? null : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
