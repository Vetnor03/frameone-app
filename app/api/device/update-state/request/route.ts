import { NextResponse } from 'next/server'
import { authenticateUserForDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { publishPilotRevision } from '@/app/lib/device/mqttPilotPublish'
import { ablyCanaryForDevice } from '@/app/lib/device/mqttRollout'
import { getAblyFrameSubscribers } from '@/app/lib/device/mqttAbly'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const requestStartedAt = Date.now()
  const body = (await req.json().catch(() => null)) as { device_id?: unknown; request_id?: unknown } | null
  const deviceId = deviceIdFrom(body?.device_id)
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  const requestId = typeof body?.request_id === 'string' ? body.request_id : ''
  if (requestId.length < 8 || requestId.length > 128) {
    return NextResponse.json({ error: 'invalid_request_id' }, { status: 400 })
  }

  const authStartedAt = Date.now()
  const auth = await authenticateUserForDevice(req, deviceId)
  const authMs = Date.now() - authStartedAt
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rpcStartedAt = Date.now()
  const { data, error } = await auth.supabase.rpc('request_device_display_revision', {
    p_device_id: deviceId,
    p_request_id: requestId,
  })
  const rpcMs = Date.now() - rpcStartedAt
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })

  // Pilot push is best-effort. The durable revision has already been recorded;
  // even an offline broker cannot prevent the frame's normal HTTPS fallback.
  const pushStartedAt = Date.now()
  const pilotPush = await publishPilotRevision(deviceId, Number(data))
  if (pilotPush !== 'disabled') {
    console.info('[device/update-state/request] mqtt-pilot', {
      device_id: deviceId,
      revision: data,
      result: pilotPush,
      duration_ms: Date.now() - pushStartedAt,
    })
  }

  // One-frame canary only: Ably accepted a message does not prove an MQTT
  // subscriber received it. Record the broker's current subscriber count.
  // This is read-only and never determines update success.
  if (pilotPush === 'published' && ablyCanaryForDevice(deviceId, {
    ablyCanaryEnabled: process.env.MQTT_ABLY_CANARY_ENABLED,
    ablyCanaryDeviceId: process.env.MQTT_ABLY_CANARY_DEVICE_ID,
    ablyApiKey: process.env.MQTT_ABLY_API_KEY,
    ablyRootCaPem: process.env.MQTT_ABLY_ROOT_CA_PEM,
  })) {
    const subscribers = await getAblyFrameSubscribers(
      deviceId, process.env.MQTT_ABLY_API_KEY,
    )
    console.info('[device/update-state/request] ably-subscriber-status', {
      device_id: deviceId,
      subscribers: subscribers === null ? 'unknown' : subscribers,
    })
  }

  console.info('[device/update-state/request] timing', {
    device_id: deviceId,
    auth_ms: authMs,
    rpc_ms: rpcMs,
    total_ms: Date.now() - requestStartedAt,
  })
  return NextResponse.json({ requested_revision: data })
}
