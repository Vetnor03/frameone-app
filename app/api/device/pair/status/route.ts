import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { legacyPairingQuarantined, LEGACY_PAIRING_DISABLED_RESPONSE } from '@/app/lib/device/pairingRollout'

export const runtime = 'nodejs'

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

    // Calls SQL function you already had in earlier plan:
    // get_or_create_device_token(device_id) -> { paired, device_token? }
    // We'll implement via your function "get_device_pair_status" if you have it.
    // So: we try one, then the other, with a friendly error if neither exists.

    // Try function 1: pair_status (common name)
    let data: unknown = null
    let errorMsg: string | null = null

    {
      const res = await supabase.rpc('get_pair_status', { p_device_id: device_id })
      if (!res.error) {
        data = res.data
      } else {
        errorMsg = res.error.message
      }
    }

    // If that didn't work, try function 2: device_pair_status
    if (!data) {
      const res2 = await supabase.rpc('device_pair_status', { p_device_id: device_id })
      if (!res2.error) {
        data = res2.data
        errorMsg = null
      } else {
        // keep last error
        errorMsg = res2.error.message
      }
    }

    // If still nothing, tell user what to do next
    if (!data) {
      return NextResponse.json(
        {
          error:
            'Missing SQL RPC for pair status. Expected function get_pair_status(p_device_id text) or device_pair_status(p_device_id text).',
          details: errorMsg,
        },
        { status: 500 }
      )
    }

    const row = Array.isArray(data) ? data[0] : data

    return NextResponse.json(row)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
