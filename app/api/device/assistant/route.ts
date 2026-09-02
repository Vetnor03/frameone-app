import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { compactAiAssistantDeviceItem, loadAiAssistantDeviceData } from '@/app/lib/device/aiAssistantDeviceData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function bearer(req: Request) { return (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '' }
function response(payload: unknown, status = 200) { return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }) }

export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get('device_id')?.trim() || ''
  const token = bearer(req)
  if (!deviceId) return response({ error: 'Missing device_id' }, 400)
  if (!token) return response({ error: 'Missing bearer token' }, 401)
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: device, error } = await supabase.from('devices').select('device_token').eq('device_id', deviceId).maybeSingle()
    if (error || !device || device.device_token !== token) return response({ error: 'Unauthorized' }, 401)
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
