import { NextResponse } from 'next/server'
import { authenticateUserForDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { publishPilotActivity } from '@/app/lib/device/mqttPilotPublish'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { device_id?: unknown } | null
  const deviceId = deviceIdFrom(body?.device_id)
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })

  const auth = await authenticateUserForDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.supabase.rpc('heartbeat_device_app_activity', { p_device_id: deviceId })
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  // Keep the durable database heartbeat authoritative. MQTT is a best-effort,
  // authenticated 120-second presence hint which lets a subscribed frame
  // switch from its idle battery cadence to fast 1-second socket servicing.
  // A broker failure must never break the app's activity endpoint.
  const activityPush = await publishPilotActivity(deviceId)
  if (activityPush !== 'disabled') {
    console.info('[device/update-state/activity] mqtt-hint', {
      device_id: deviceId, result: activityPush,
    })
  }
  return NextResponse.json({ app_active_until: data })
}
