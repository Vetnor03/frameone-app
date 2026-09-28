// app/api/device/frame-config/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/app/lib/supabase/serviceClient'
import { authenticatePhysicalDevice } from '@/app/lib/device/updateStateAuth'
import { legacyPairingQuarantined, LEGACY_PAIRING_DISABLED_RESPONSE } from '@/app/lib/device/pairingRollout'
import { buildFrameConfigPayload, deviceHasOwnerAccessLink, pairRequiredPayload } from './builder'

export const runtime = 'nodejs'

function asPairingCode(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

type PairingRpcClient = {
  rpc: (fn: 'start_pairing', args: { p_device_id: string }) => Promise<{ data: unknown; error: { message: string } | null }>
}

async function startPairingPayload(rpcClient: PairingRpcClient, deviceId: string) {
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
  let deviceIdForLog = ''
  let phase = 'parse_request'

  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')
    deviceIdForLog = device_id || ''

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Pairing remains available without a device token.
    phase = 'check_pairing'
    const hasOwnerAccessLink = await deviceHasOwnerAccessLink(supabase, device_id)

    if (!hasOwnerAccessLink) {
      // Legacy firmware cannot bootstrap trust from an ID in staging.
      // Keep the authenticated paired branch below unchanged.
      if (legacyPairingQuarantined()) {
        return NextResponse.json(LEGACY_PAIRING_DISABLED_RESPONSE, {
          status: 410,
          headers: { 'Cache-Control': 'no-store' },
        })
      }
      phase = 'start_pairing'
      const payload = await startPairingPayload(
        supabase as unknown as PairingRpcClient,
        device_id
      )
      return NextResponse.json(payload)
    }

    // Paired-device configuration requires its own device token.
    phase = 'authenticate_device'
    const auth = await authenticatePhysicalDevice(req, device_id)

    if ('error' in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      )
    }

    phase = 'build_payload'
    const payload = await buildFrameConfigPayload(supabase, device_id)

    // Do not issue a pairing response after authentication.
    // A changed pairing state should not cause firmware to clear its token.
    if ('pair_required' in payload && payload.pair_required === true) {
      return NextResponse.json(
        { error: 'Pairing state changed' },
        { status: 409 }
      )
    }

    phase = 'serialize_payload'
    const responseBody = JSON.stringify(payload)

    return new NextResponse(responseBody, {
      headers: {
        'content-type': 'application/json',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('frame-config request failed', {
      device_id: deviceIdForLog || null,
      phase,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
