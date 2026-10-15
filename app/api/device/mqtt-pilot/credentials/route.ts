import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { pilotCredentialPayload } from '@/app/lib/device/mqttPilotCredentials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

// This endpoint MUST never authenticate via browser user sessions.
// Only the physically provisioned device's Bearer token may read its
// own pilot MQTT credentials, and only with the explicit pilot allowlist.
export async function GET(req: Request) {
  const deviceId = deviceIdFrom(new URL(req.url).searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400, headers: NO_STORE })

  // Fail closed before doing any DB work unless exactly one pilot is enabled.
  const credentials = pilotCredentialPayload(deviceId)
  if (!credentials) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404, headers: NO_STORE })
  }

  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE })
  }

  return NextResponse.json(credentials, { headers: NO_STORE })
}
