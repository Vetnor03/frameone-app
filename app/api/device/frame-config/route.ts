// app/api/device/frame-config/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildFrameConfigPayload } from './builder'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const payload = await buildFrameConfigPayload(supabase, device_id)

    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
