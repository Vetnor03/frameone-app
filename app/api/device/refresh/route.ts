import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice } from '@/app/lib/device/updateStateAuth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const auth = await authenticatePhysicalDevice(req, device_id)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = auth.supabase

    // ✅ Upsert refresh time
    const { error } = await supabase
      .from('device_status')
      .upsert(
        {
          device_id,
          last_refresh_at: new Date().toISOString(),
        },
        { onConflict: 'device_id' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
