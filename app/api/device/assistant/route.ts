import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AI_ASSISTANT_FRAME_LIMITS, sanitizeAiAssistantMirrorSummary, selectAiAssistantFrameItems, type AiAssistantFrameUpdate } from '@/app/lib/device/aiAssistantFrame'
import { aiAssistantDefaultTopicTitle, simplifyAiAssistantTopicTitle } from '@/app/lib/device/aiAssistantTopicTitle.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UnknownRecord = Record<string, unknown>

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function uniqueNonEmpty(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function emptyAssistantPayload() {
  return {
    primary: 'UPDATES',
    secondary: 'UPDATES',
    items: [],
    overflowCount: 0,
    activeWatchCount: 0,
    lastCheckedAt: null,
    topicTitle: aiAssistantDefaultTopicTitle('en'),
    activeWatchRequests: [],
  }
}

async function physicalAssistantPayload(supabase: SupabaseClient, frameId: string, renderCycleId: string | null, limit = AI_ASSISTANT_FRAME_LIMITS.full) {
  const empty = emptyAssistantPayload()

  const renderCycleMs = renderCycleId ? new Date(renderCycleId).getTime() : Number.NaN
  const referenceMs = Number.isNaN(renderCycleMs) ? Date.now() : renderCycleMs
  const sinceIso = new Date(referenceMs - 24 * 60 * 60 * 1000).toISOString()

  const { data: memberRows, error: memberError } = await supabase
    .from('device_members')
    .select('user_id')
    .eq('device_id', frameId)
  if (memberError) throw memberError

  const memberUserIds = uniqueNonEmpty(Array.isArray(memberRows) ? memberRows.map((row: { user_id?: unknown }) => row.user_id) : [])
  if (memberUserIds.length <= 0) return empty

  const { data: watchRows, error: watchError } = await supabase
    .from('monitoring_watches')
    .select('id, last_checked_at, status, title, preferred_language, created_at, original_request')
    .in('owner_user_id', memberUserIds)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (watchError) throw watchError

  const activeWatches = Array.isArray(watchRows) ? watchRows : []
  const activeWatchRequests = activeWatches
    .map((row: { original_request?: unknown }) => asString(row.original_request).trim())
    .filter(Boolean)
    .slice(0, 5)
  const activeTopicTitle = activeWatches.length === 1 ? simplifyAiAssistantTopicTitle(activeWatches[0]?.title, 'en') || aiAssistantDefaultTopicTitle('en') : aiAssistantDefaultTopicTitle('en')
  const lastCheckedAt = activeWatches
    .map((row: { last_checked_at?: unknown }) => asString(row.last_checked_at).trim())
    .filter(Boolean)
    .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || null

  const { data, error } = await supabase
    .from('monitoring_updates')
    .select('id, headline, summary, created_at, dismissed_from_frame, is_read, monitoring_watches!inner(owner_user_id, title, preferred_language)')
    .in('monitoring_watches.owner_user_id', memberUserIds)
    .eq('is_read', false)
    .eq('dismissed_from_frame', false)
    .gt('created_at', sinceIso)
    .lte('created_at', new Date(referenceMs).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit + 25)
  if (error) throw error

  const selected = selectAiAssistantFrameItems((Array.isArray(data) ? data : []) as AiAssistantFrameUpdate[], { memberUserIds, limit, renderCycleId })
  const items = selected.items.slice(0, 1).map((item) => ({
    id: item.id,
    headline: item.headline,
    summary: sanitizeAiAssistantMirrorSummary(item.summary, item.headline, 26),
    created_at: item.created_at,
    topicTitle: item.topicTitle,
  }))

  return {
    primary: 'UPDATES',
    secondary: 'UPDATES',
    items,
    overflowCount: selected.overflowCount,
    activeWatchCount: activeWatches.length,
    lastCheckedAt,
    topicTitle: items[0]?.topicTitle || activeTopicTitle,
    activeWatchRequests,
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const deviceId = url.searchParams.get('device_id') || ''
    if (!deviceId) return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: statusRow } = await supabase
      .from('device_status')
      .select('last_render_at, last_refresh_at')
      .eq('device_id', deviceId)
      .maybeSingle()

    const status = (statusRow ?? null) as UnknownRecord | null
    const renderCycleId = asString(status?.last_render_at) || asString(status?.last_refresh_at) || null
    const payload = await physicalAssistantPayload(supabase, deviceId, renderCycleId)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    console.error('[device-assistant:failed]', { reason: e instanceof Error ? e.message : String(e || 'Unknown error') })
    return NextResponse.json(emptyAssistantPayload())
  }
}
