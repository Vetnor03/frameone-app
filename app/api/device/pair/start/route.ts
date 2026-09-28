import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { legacyPairingQuarantined, LEGACY_PAIRING_DISABLED_RESPONSE } from '@/app/lib/device/pairingRollout'

export const runtime = 'nodejs'

// TEMP: using GET so you can test in browser easily
export async function GET(req: Request) {
  // Staging must not mint/return a legacy bearer or create an ID-only claim
  // session. Guard before any service-role client or RPC is touched.
  if (legacyPairingQuarantined()) {
    return NextResponse.json(LEGACY_PAIRING_DISABLED_RESPONSE, {
      status: 410,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
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

    const { data, error } = await supabase.rpc('start_pairing', {
      p_device_id: device_id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : data

    return NextResponse.json(row)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
