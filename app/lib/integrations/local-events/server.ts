import { EDGE_OF_NORWAY_PROVIDER, runEdgeOfNorwayShadowDiagnostic, type EdgeOfNorwayAcceptedEvent } from './edge-of-norway-shadow'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { getLocalEventPlace, normalizeLocalEventAreaPreference, suggestedLocalEventArea, type LocalEventAreaPreference } from './places'

export type LocalEventsSyncResult = { importedCount: number; zeroEvents: boolean; areaPreference: LocalEventAreaPreference }

function eventStartsAt(event: EdgeOfNorwayAcceptedEvent) {
  return event.startTime ? `${event.date}T${event.startTime}:00+02:00` : `${event.date}T00:00:00+02:00`
}

export function localEventUserMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/fetch|timeout|network/i.test(message)) return 'Could not fetch Local Events right now. Please try again.'
  if (/parse|source/i.test(message)) return 'Could not read Local Events right now. Please try again.'
  return 'Could not connect Local Events. Please try again.'
}

export async function syncLocalEventsForUser(userId: string, areaPreference: unknown, fetchImpl = fetch): Promise<LocalEventsSyncResult> {
  const area = normalizeLocalEventAreaPreference(areaPreference) || suggestedLocalEventArea('stavanger')
  const result = await runEdgeOfNorwayShadowDiagnostic(fetchImpl, area)
  if (result.error || result.diagnosticError) throw new Error(result.error || result.diagnosticError?.message || 'Local Events sync failed')
  const now = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const rows = result.acceptedEvents.map((event) => ({
    user_id: userId,
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
      primaryPlaceId: area.primaryPlaceId,
      includedPlaceIds: area.includedPlaceIds,
      type: 'local-event',
    },
    updated_at: now,
  }))
  if (rows.length) {
    const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  const returnedIds = rows.map((row) => row.external_id)
  let stale = supabase.from('integration_items').delete().eq('user_id', userId).eq('provider', EDGE_OF_NORWAY_PROVIDER).gte('starts_at', now)
  if (returnedIds.length) stale = stale.not('external_id', 'in', `(${returnedIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',')})`)
  const { error: staleError } = await stale
  if (staleError) throw new Error(staleError.message)
  const { error: expiredError } = await supabase.from('integration_items').delete().eq('user_id', userId).eq('provider', EDGE_OF_NORWAY_PROVIDER).lt('starts_at', now)
  if (expiredError) throw new Error(expiredError.message)
  return { importedCount: rows.length, zeroEvents: rows.length === 0, areaPreference: area }
}

export async function connectLocalEventsForUser(userId: string, areaPreference: unknown, fetchImpl = fetch) {
  const sync = await syncLocalEventsForUser(userId, areaPreference, fetchImpl)
  const supabase = getSupabaseAdmin()
  const primary = getLocalEventPlace(sync.areaPreference.primaryPlaceId)
  const now = new Date().toISOString()
  const { data, error } = await supabase.from('user_integrations').upsert({
    user_id: userId,
    provider: EDGE_OF_NORWAY_PROVIDER,
    status: 'connected',
    encrypted_credentials: { areaPreference: sync.areaPreference },
    external_account_id: sync.areaPreference.primaryPlaceId,
    external_account_label: primary?.displayName || sync.areaPreference.primaryPlaceId,
    last_sync_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: 'user_id,provider' }).select('provider,status,external_account_label,encrypted_credentials,last_sync_at,updated_at').single()
  if (error) throw new Error(error.message)
  return { ...data, importedCount: sync.importedCount, zeroEvents: sync.zeroEvents, areaPreference: sync.areaPreference }
}

export async function disconnectLocalEventsForUser(userId: string) {
  const supabase = getSupabaseAdmin()
  const { error: itemError } = await supabase.from('integration_items').delete().eq('user_id', userId).eq('provider', EDGE_OF_NORWAY_PROVIDER)
  if (itemError) throw new Error(itemError.message)
  const { error } = await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', EDGE_OF_NORWAY_PROVIDER)
  if (error) throw new Error(error.message)
}
