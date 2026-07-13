import { EDGE_OF_NORWAY_PROVIDER, runEdgeOfNorwayShadowDiagnostic, type EdgeOfNorwayAcceptedEvent } from './edge-of-norway-shadow'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { getLocalEventPlace, normalizeLocalEventAreaPreference, suggestedLocalEventArea, type LocalEventAreaPreference } from './places'

export type LocalEventsSyncResult = { importedCount: number; zeroEvents: boolean; areaPreference: LocalEventAreaPreference }

const FRAME_MANAGER_ROLES = new Set(['owner', 'admin'])

function eventStartsAt(event: EdgeOfNorwayAcceptedEvent) {
  return event.startTime ? `${event.date}T${event.startTime}:00+02:00` : `${event.date}T00:00:00+02:00`
}

export function localEventUserMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/permission|forbidden/i.test(message)) return 'You do not have permission to manage Local Events for this frame.'
  if (/frame/i.test(message)) return 'Select a frame before managing Local Events.'
  if (/fetch|timeout|network/i.test(message)) return 'Could not fetch Local Events right now. Please try again.'
  if (/parse|source/i.test(message)) return 'Could not read Local Events right now. Please try again.'
  return 'Could not connect Local Events. Please try again.'
}

export async function requireLocalEventsFrameMember(userId: string, deviceId: string, manage = false) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('device_members').select('role').eq('device_id', deviceId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Forbidden')
  const role = typeof data.role === 'string' ? data.role : ''
  if (manage && !FRAME_MANAGER_ROLES.has(role)) throw new Error('Forbidden')
  return { role, canManage: FRAME_MANAGER_ROLES.has(role) }
}

export async function syncLocalEventsForFrame(userId: string, deviceId: string, areaPreference: unknown, fetchImpl = fetch): Promise<LocalEventsSyncResult> {
  await requireLocalEventsFrameMember(userId, deviceId, true)
  const area = normalizeLocalEventAreaPreference(areaPreference) || suggestedLocalEventArea('stavanger')
  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl, area)
  if (result.error || result.diagnosticError) throw new Error(result.error || result.diagnosticError?.message || 'Local Events sync failed')
  const now = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const rows = result.acceptedEvents.map((event) => ({
    user_id: userId,
    device_id: deviceId,
    provider: EDGE_OF_NORWAY_PROVIDER,
    external_id: event.externalId || event.sourceUrl,
    title: event.title,
    body: null,
    starts_at: eventStartsAt(event),
    due_at: eventStartsAt(event),
    priority: 0,
    raw: {
      provider: EDGE_OF_NORWAY_PROVIDER,
      externalId: event.externalId || event.sourceUrl,
      title: event.title,
      sourceUrl: event.sourceUrl,
      date: event.date,
      startTime: event.startTime,
      allDay: event.allDay,
      sourceLocation: event.sourceLocation,
      areaKey: event.areaKey || area.primaryPlaceId,
      areaKeys: event.areaKeys?.length ? event.areaKeys : [event.areaKey || area.primaryPlaceId],
      primaryPlaceId: area.primaryPlaceId,
      includedPlaceIds: area.includedPlaceIds,
      type: 'local-event',
      scope: 'frame',
    },
    updated_at: now,
  }))
  if (rows.length) {
    const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'device_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  const { error: expiredError } = await supabase.from('integration_items').delete().eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER).lt('starts_at', now)
  if (expiredError) throw new Error(expiredError.message)
  return { importedCount: rows.length, zeroEvents: rows.length === 0, areaPreference: area }
}

export async function connectLocalEventsForFrame(userId: string, deviceId: string, areaPreference: unknown, fetchImpl = fetch) {
  const sync = await syncLocalEventsForFrame(userId, deviceId, areaPreference, fetchImpl)
  const supabase = getSupabaseAdmin()
  const primary = getLocalEventPlace(sync.areaPreference.primaryPlaceId)
  const now = new Date().toISOString()
  const { data, error } = await supabase.from('user_integrations').upsert({
    user_id: userId,
    device_id: deviceId,
    provider: EDGE_OF_NORWAY_PROVIDER,
    status: 'connected',
    encrypted_credentials: { areaPreference: sync.areaPreference, scope: 'frame' },
    external_account_id: sync.areaPreference.primaryPlaceId,
    external_account_label: primary?.displayName || sync.areaPreference.primaryPlaceId,
    last_sync_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: 'device_id,provider' }).select('provider,status,external_account_label,encrypted_credentials,last_sync_at,updated_at').single()
  if (error) throw new Error(error.message)
  return { ...data, importedCount: sync.importedCount, zeroEvents: sync.zeroEvents, areaPreference: sync.areaPreference }
}

export async function disconnectLocalEventsForFrame(userId: string, deviceId: string) {
  await requireLocalEventsFrameMember(userId, deviceId, true)
  const supabase = getSupabaseAdmin()
  const { error: itemError } = await supabase.from('integration_items').delete().eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER)
  if (itemError) throw new Error(itemError.message)
  const { error: skipError } = await supabase.from('local_event_frame_skips').delete().eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER)
  if (skipError) throw new Error(skipError.message)
  const { error } = await supabase.from('user_integrations').delete().eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER)
  if (error) throw new Error(error.message)
}
