import { EDGE_OF_NORWAY_PROVIDER } from './edge-of-norway-shadow'
import { fetchNationwideEvents, upstreamRetryDeferred } from './nationwide'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { localEventDisplayTitle } from './display'
import { getLocalEventPlace, normalizeLocalEventAreaPreference, suggestedLocalEventArea, type LocalEventAreaPreference } from './places'

export type LocalEventsSyncResult = { importedCount: number; zeroEvents: boolean; areaPreference: LocalEventAreaPreference }

const FRAME_MANAGER_ROLES = new Set(['owner', 'admin'])

function eventStartsAt(event: { date: string; startTime: string | null }) {
  // Ticketmaster returns local Norwegian wall-clock times. Respect CET/CEST transitions.
  const noon = new Date(`${event.date}T12:00:00Z`)
  const offset = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Oslo', timeZoneName: 'shortOffset' })
    .formatToParts(noon).find((part) => part.type === 'timeZoneName')?.value
  const hours = Number(offset?.match(/GMT\+(\d+)/)?.[1]) === 2 ? '02' : '01'
  return `${event.date}T${event.startTime || '00:00'}:00+${hours}:00`
}

export function localEventUserMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/permission|forbidden/i.test(message)) return 'You do not have permission to manage Local Events for this frame.'
  if (/frame/i.test(message)) return 'Select a frame before managing Local Events.'
  if (/not configured|no national event source/i.test(message)) return 'Events needs a Ticketmaster API key before national event imports can start.'
  if (/choose a norwegian place/i.test(message)) return 'Choose a place in Norway to enable national Events.'
  if (/429|rate.?limit|too many requests/i.test(message)) return 'Events source is temporarily rate limited. It will retry automatically.'
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
  const result = await fetchNationwideEvents(area, fetchImpl)
  const now = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const rows = result.acceptedEvents.map((event) => {
    const displayTitle = localEventDisplayTitle(event.title, event.date) || event.title
    return {
      user_id: userId,
      device_id: deviceId,
      provider: EDGE_OF_NORWAY_PROVIDER,
      external_id: event.externalId || event.sourceUrl,
      title: displayTitle,
      body: null,
      starts_at: eventStartsAt(event),
      due_at: eventStartsAt(event),
      priority: 0,
      raw: {
        provider: EDGE_OF_NORWAY_PROVIDER,
        eventSource: 'source' in event ? event.source : 'ticketmaster',
        venue: 'venue' in event ? event.venue : null,
        distanceKm: 'distanceKm' in event ? event.distanceKm : null,
        latitude: 'latitude' in event ? event.latitude : null,
        longitude: 'longitude' in event ? event.longitude : null,
        externalId: event.externalId || event.sourceUrl,
        title: event.title,
        displayTitle,
        sourceUrl: event.sourceUrl,
        date: event.date,
        startTime: event.startTime,
        allDay: event.allDay,
        sourceLocation: event.venue,
        areaKey: area.primaryPlaceId,
        areaKeys: [area.primaryPlaceId],
        primaryPlaceId: area.primaryPlaceId,
        includedPlaceIds: area.includedPlaceIds,
        type: 'local-event',
        scope: 'frame',
      },
      updated_at: now,
    }
  })
  // Preserve the last good feed when an upstream fetch fails, but remove stale future
  // entries after a successful import (including when the selected location changes).
  if (rows.length) {
    const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'device_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  const { data: previouslyStored, error: listingError } = await supabase.from('integration_items')
    .select('external_id').eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER).limit(2000)
  if (listingError) throw new Error(listingError.message)
  const currentIds = new Set(rows.map((row) => row.external_id))
  const obsoleteIds = (previouslyStored || []).map((row) => row.external_id).filter((id) => !currentIds.has(id))
  for (let index = 0; index < obsoleteIds.length; index += 200) {
    const { error: pruneError } = await supabase.from('integration_items').delete()
      .eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER)
      .in('external_id', obsoleteIds.slice(index, index + 200))
    if (pruneError) throw new Error(pruneError.message)
  }
  return { importedCount: rows.length, zeroEvents: rows.length === 0, areaPreference: area }
}

export async function connectLocalEventsForFrame(userId: string, deviceId: string, areaPreference: unknown, fetchImpl = fetch) {
  const area = normalizeLocalEventAreaPreference(areaPreference) || suggestedLocalEventArea('stavanger')
  await requireLocalEventsFrameMember(userId, deviceId, true)

  const supabase = getSupabaseAdmin()
  const primary = getLocalEventPlace(area.primaryPlaceId)
  const connectedAt = new Date().toISOString()
  const { data: previous, error: previousError } = await supabase.from('user_integrations')
    .select('last_error,last_error_at').eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER).maybeSingle()
  if (previousError) throw new Error(previousError.message)
  const deferSync = upstreamRetryDeferred(previous?.last_error, previous?.last_error_at)
  const { data, error } = await supabase.from('user_integrations').upsert({
    user_id: userId,
    device_id: deviceId,
    provider: EDGE_OF_NORWAY_PROVIDER,
    status: 'connected',
    encrypted_credentials: { areaPreference: area, scope: 'frame' },
    external_account_id: area.primaryPlaceId,
    external_account_label: area.placeLabel || primary?.displayName || area.primaryPlaceId,
    last_error: deferSync ? previous?.last_error : null,
    last_error_at: deferSync ? previous?.last_error_at : null,
    updated_at: connectedAt,
  }, { onConflict: 'device_id,provider' }).select('provider,status,external_account_label,encrypted_credentials,last_sync_at,updated_at').single()
  if (error) throw new Error(error.message)
  if (deferSync) {
    return { ...data, importedCount: 0, zeroEvents: false, areaPreference: area,
      syncPending: true, syncError: 'Event source rate limited. Automatic retry will be delayed.' }
  }

  try {
    const sync = await syncLocalEventsForFrame(userId, deviceId, area, fetchImpl)
    const syncedAt = new Date().toISOString()
    const { data: syncedData, error: updateError } = await supabase
      .from('user_integrations')
      .update({ last_sync_at: syncedAt, last_error: null, last_error_at: null, updated_at: syncedAt })
      .eq('device_id', deviceId)
      .eq('provider', EDGE_OF_NORWAY_PROVIDER)
      .select('provider,status,external_account_label,encrypted_credentials,last_sync_at,updated_at')
      .single()
    if (updateError) throw new Error(updateError.message)
    return { ...(syncedData || data), importedCount: sync.importedCount, zeroEvents: sync.zeroEvents, areaPreference: sync.areaPreference, syncPending: false, syncError: null }
  } catch (syncError) {
    const failedAt = new Date().toISOString()
    const message = syncError instanceof Error ? syncError.message : 'Local Events sync failed'
    const { error: updateError } = await supabase
      .from('user_integrations')
      .update({ last_error: message, last_error_at: failedAt, updated_at: failedAt })
      .eq('device_id', deviceId)
      .eq('provider', EDGE_OF_NORWAY_PROVIDER)
    if (updateError) console.error('Could not persist Local Events sync error', { deviceId, error: updateError })
    return { ...data, importedCount: 0, zeroEvents: false, areaPreference: area, syncPending: true, syncError: localEventUserMessage(syncError) }
  }
}

export async function syncAllConnectedLocalEventsFrames(fetchImpl = fetch) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('user_id,device_id,encrypted_credentials,last_error,last_error_at')
    .eq('provider', EDGE_OF_NORWAY_PROVIDER)
    .eq('status', 'connected')
  if (error) throw new Error(error.message)

  const integrations = (data || []).filter((row) => typeof row.user_id === 'string' && typeof row.device_id === 'string' && row.device_id)
  let succeeded = 0
  let failed = 0
  let deferred = 0
  let importedCount = 0

  for (const integration of integrations) {
    if (upstreamRetryDeferred(integration.last_error, integration.last_error_at)) {
      deferred += 1
      continue
    }
    const credentials = integration.encrypted_credentials as { areaPreference?: unknown } | null
    const areaPreference = normalizeLocalEventAreaPreference(credentials?.areaPreference)
    try {
      const result = await syncLocalEventsForFrame(integration.user_id, integration.device_id, areaPreference, fetchImpl)
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('user_integrations')
        .update({ last_sync_at: now, last_error: null, last_error_at: null, updated_at: now })
        .eq('device_id', integration.device_id)
        .eq('provider', EDGE_OF_NORWAY_PROVIDER)
      if (updateError) throw new Error(updateError.message)
      succeeded += 1
      importedCount += result.importedCount
    } catch (syncError) {
      failed += 1
      const now = new Date().toISOString()
      const message = syncError instanceof Error ? syncError.message : 'Local Events sync failed'
      await supabase
        .from('user_integrations')
        .update({ last_error: message, last_error_at: now, updated_at: now })
        .eq('device_id', integration.device_id)
        .eq('provider', EDGE_OF_NORWAY_PROVIDER)
    }
  }

  return { processed: integrations.length, succeeded, failed, deferred, importedCount }
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
