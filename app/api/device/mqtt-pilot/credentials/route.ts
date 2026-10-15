import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { pilotCredentialPayload } from '@/app/lib/device/mqttPilotCredentials'
import { mqttEnabledForDevice } from '@/app/lib/device/mqttRollout'
import { provisionFrameMqtt } from '@/app/lib/device/mqttFleetProvisioning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

function brokerConnectionDetails() {
  const host = process.env.MQTT_BROKER_HOST || 'i5138504.ala.us-east-1.emqxsl.com'
  const port = Number(process.env.MQTT_BROKER_PORT || '8883')
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host) ||
      !Number.isInteger(port) || port < 1 || port > 65535) return null
  return { broker_host: host, broker_port: port }
}

// A physical frame's own HTTP device token is required (never browser JWT).
// Credentials are created on demand only after pairing and authentication.
// The unverified or unsupported broker path fails safely and never leaks a key.
export async function GET(req: Request) {
  const deviceId = deviceIdFrom(new URL(req.url).searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400, headers: NO_STORE })
  if (!mqttEnabledForDevice(deviceId)) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404, headers: NO_STORE })
  }
  const connection = brokerConnectionDetails()
  if (!connection) return NextResponse.json({ error: 'broker_not_configured' }, { status: 503, headers: NO_STORE })

  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE })
  }

  // Preserve the manually configured prototype's original authenticated
  // credentials path. This is deliberately checked before the new fleet-only
  // pairing gate so the pilot can't regress during backend migration.
  const pilot = pilotCredentialPayload(deviceId)
  if (pilot) return NextResponse.json({ ...pilot, ...connection }, { headers: NO_STORE })

  // Only paired frames get a broker account, preventing a factory/shelf-mode
  // device from provisioning itself before a user actually claims it.
  const { data: members, error: memberError } = await auth.supabase
    .from('device_members')
    .select('device_id')
    .eq('device_id', deviceId)
    .limit(1)
  if (memberError) return NextResponse.json({ error: 'backend_unavailable' }, { status: 503, headers: NO_STORE })
  if (!members?.length) return NextResponse.json({ error: 'not_paired' }, { status: 403, headers: NO_STORE })

  // Fleet onboarding is separately gated until per-user management endpoints
  // have been confirmed on the selected broker tier. Even if those endpoints
  // are unsupported, the firmware keeps its proven HTTPS fallback.
  if (process.env.MQTT_FLEET_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404, headers: NO_STORE })
  }
  const provision = await provisionFrameMqtt(deviceId)
  if (!provision.ok) {
    console.warn('[mqtt-credentials] fleet provisioning deferred', { device_id: deviceId, reason: provision.reason })
    return NextResponse.json({ error: 'broker_unavailable' }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json({ username: provision.username, password: provision.password, ...connection }, {
    headers: NO_STORE,
  })
}
