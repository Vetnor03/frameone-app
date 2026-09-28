import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { compactAiAssistantDeviceItem, loadAiAssistantDeviceData } from '@/app/lib/device/aiAssistantDeviceData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }) }

export async function GET(req: Request) {
  const deviceId = deviceIdFrom(new URL(req.url).searchParams.get('device_id'))
  if (!deviceId) return response({ error: 'Missing device_id' }, 400)
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return response({ error: auth.error }, auth.status)
  try {
    const supabase = auth.supabase
    const [data, settingsResult] = await Promise.all([
      loadAiAssistantDeviceData(supabase, deviceId),
      supabase.from('device_settings').select('settings_json').eq('device_id', deviceId).maybeSingle(),
    ])
    if (settingsResult.error) throw settingsResult.error
    const settings = settingsResult.data?.settings_json
    // Watch language describes update content. Device chrome follows the
    // authoritative frame preference, just like the other device endpoints.
    const language = settings && typeof settings === 'object' && 'language' in settings && settings.language === 'no' ? 'no' : 'en'
    const updates = data.items.map(compactAiAssistantDeviceItem).filter((item) => item.topic && item.summary)
    return response({ ok: true, language, active_watch_count: data.activeWatches.length, update_count: updates.length + data.overflowCount, updates, overflow_count: data.overflowCount })
  } catch (error) {
    console.error('/api/device/assistant failed', { deviceId, reason: error instanceof Error ? error.message : 'unknown' })
    return response({ error: 'Assistant data unavailable' }, 503)
  }
}
