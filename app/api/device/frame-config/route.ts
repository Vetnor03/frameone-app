// app/api/device/frame-config/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildFrameConfigPayload, pairRequiredPayload } from './builder'

export const runtime = 'nodejs'

function asPairingCode(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

type PairingRpcClient = {
  rpc: (fn: 'start_pairing', args: { p_device_id: string }) => Promise<{ data: unknown; error: { message: string } | null }>
}

async function startPairingPayload(supabase: ReturnType<typeof createClient>, deviceId: string) {
  const rpcClient = supabase as unknown as PairingRpcClient
  const { data, error } = await rpcClient.rpc('start_pairing', { p_device_id: deviceId })
  if (error) throw new Error(error.message)

  const row = Array.isArray(data) ? data[0] : data
  const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
  const pairing_code = asPairingCode(record.pairing_code) || asPairingCode(record.pair_code)
  return pairRequiredPayload(deviceId, {
    pairing_code,
    expires_in: typeof record.expires_in === 'number' ? record.expires_in : undefined,
    expires_in_sec: typeof record.expires_in_sec === 'number' ? record.expires_in_sec : undefined,
  })
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const builtPayload = await buildFrameConfigPayload(supabase, device_id)
    const isUnpaired = 'pair_required' in builtPayload && builtPayload.pair_required === true
    const payload = isUnpaired ? await startPairingPayload(supabase, device_id) : builtPayload
    const responseBody = JSON.stringify(payload)

    if (device_id === 'frm_54AE37455F34') {
      console.info(responseBody)
    }

    return new NextResponse(responseBody, {
      headers: {
        'content-type': 'application/json',
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
