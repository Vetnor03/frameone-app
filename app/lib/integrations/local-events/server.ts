import { EDGE_OF_NORWAY_PROVIDER, runEdgeOfNorwayShadowDiagnostic, type EdgeOfNorwayAcceptedEvent } from './edge-of-norway-shadow'
import { LINTICKET_PROVIDER, runLinTicketDiagnostic, type NormalizedLocalEvent } from './linticket.ts'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { getLocalEventPlace, matchCanonicalLocalEventLocation, normalizeLocalEventAreaPreference, suggestedLocalEventArea, type LocalEventAreaPreference } from './places.ts'

export type LocalEventsSyncResult = { importedCount: number; zeroEvents: boolean; areaPreference: LocalEventAreaPreference; providerDiagnostics: Record<string, unknown> }

const FRAME_MANAGER_ROLES = new Set(['owner', 'admin'])

function norm(value: unknown) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function sameLocalEvent(a: any, b: any) {
  if (norm(a.title) !== norm(b.title)) return false
  const ad = String(a.raw?.date || a.starts_at || '').slice(0, 10)
  const bd = String(b.raw?.date || b.starts_at || '').slice(0, 10)
  if (!ad || ad !== bd) return false
  const av = norm(a.raw?.venue || a.raw?.canonicalLocation?.name || a.raw?.sourceLocation)
  const bv = norm(b.raw?.venue || b.raw?.canonicalLocation?.name || b.raw?.sourceLocation)
  const aa = norm(a.raw?.address)
  const ba = norm(b.raw?.address)
  const au = norm(a.raw?.sourceUrl)
  const bu = norm(b.raw?.sourceUrl)
  return (!!av && av === bv && !!aa && aa === ba) || (!!au && au === bu)
}
function dedupeLocalEventRows<T extends { raw: any; provider: string; external_id: string }>(rows: T[]): T[] {
  const out: T[] = []
  for (const row of rows) {
    const existing = out.find((candidate) => sameLocalEvent(candidate, row))
    if (!existing) out.push(row)
    else {
      existing.raw = { ...row.raw, ...existing.raw, providers: Array.from(new Set([...(existing.raw?.providers || [existing.provider]), ...(row.raw?.providers || [row.provider])])), providerRecordIds: { ...(existing.raw?.providerRecordIds || {}), ...(row.raw?.providerRecordIds || {}) } }
    }
  }
  return out
}

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
  const [edgeResult, linticketResult] = await Promise.all([
    runEdgeOfNorwayShadowDiagnostic(fetchImpl, area).catch((error) => ({ provider: EDGE_OF_NORWAY_PROVIDER, acceptedEvents: [], error: error instanceof Error ? error.message : String(error), diagnosticError: error } as any)),
    runLinTicketDiagnostic(fetchImpl).catch((error) => ({ provider: LINTICKET_PROVIDER, acceptedEvents: [], error: error instanceof Error ? error.message : String(error), diagnosticError: error } as any)),
  ])
  const providerDiagnostics = { [EDGE_OF_NORWAY_PROVIDER]: edgeResult, [LINTICKET_PROVIDER]: linticketResult }
  const now = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const edgeRows = ((edgeResult as any).acceptedEvents || []).map((event: EdgeOfNorwayAcceptedEvent) => {
    const canonicalLocation = matchCanonicalLocalEventLocation({ name: event.sourceLocation || area.primaryPlaceId, countryCode: 'NO' }) || getLocalEventPlace(event.areaKey || area.primaryPlaceId) || getLocalEventPlace(area.primaryPlaceId)
    const canonicalEventId = `local-events:${canonicalLocation?.id || event.areaKey || area.primaryPlaceId}:${event.externalId || event.sourceUrl}:${eventStartsAt(event)}`
    return ({
      user_id: userId,
      device_id: deviceId,
      provider: EDGE_OF_NORWAY_PROVIDER,
      external_id: canonicalEventId,
      title: event.title,
      body: null,
      starts_at: eventStartsAt(event),
      due_at: eventStartsAt(event),
      priority: 0,
      raw: {
        provider: EDGE_OF_NORWAY_PROVIDER,
        providers: [EDGE_OF_NORWAY_PROVIDER],
        providerRecordIds: { [EDGE_OF_NORWAY_PROVIDER]: [event.externalId || event.sourceUrl] },
        canonicalEventId,
        externalId: event.externalId || event.sourceUrl,
        title: event.title,
        sourceUrl: event.sourceUrl,
        date: event.date,
        startTime: event.startTime,
        allDay: event.allDay,
        sourceLocation: event.sourceLocation,
        areaKey: canonicalLocation?.id || event.areaKey || area.primaryPlaceId,
        locationId: canonicalLocation?.id || event.areaKey || area.primaryPlaceId,
        canonicalLocation: canonicalLocation ? { id: canonicalLocation.id, name: canonicalLocation.name, normalizedName: canonicalLocation.normalizedName, municipality: canonicalLocation.municipality, municipalityNumber: canonicalLocation.municipalityNumber, county: canonicalLocation.county, countryCode: canonicalLocation.countryCode, latitude: canonicalLocation.latitude, longitude: canonicalLocation.longitude, aliases: canonicalLocation.aliases, sources: canonicalLocation.sources } : null,
        primaryPlaceId: area.primaryPlaceId,
        includedPlaceIds: area.includedPlaceIds,
        type: 'local-event',
        scope: 'frame',
      },
      updated_at: now,
    })
  })
  const linticketRows = ((linticketResult as any).acceptedEvents || [])
    .filter((event: NormalizedLocalEvent) => !area.primaryPlaceId || event.location?.id === area.primaryPlaceId || area.includedPlaceIds.includes(event.location?.id || ''))
    .map((event: NormalizedLocalEvent) => ({
      user_id: userId,
      device_id: deviceId,
      provider: LINTICKET_PROVIDER,
      external_id: event.canonicalEventId,
      title: event.title,
      body: event.description,
      starts_at: event.startsAt,
      due_at: event.endsAt || event.startsAt,
      priority: 0,
      raw: { ...event, provider: LINTICKET_PROVIDER, providers: [LINTICKET_PROVIDER], type: 'local-event', scope: 'frame', areaKey: event.location?.id, locationId: event.location?.id, sourceUrl: event.eventUrl, date: event.startsAt.slice(0, 10), allDay: event.allDay, canonicalLocation: event.location },
      updated_at: now,
    }))
  const rows = dedupeLocalEventRows([...edgeRows, ...linticketRows])
  if (rows.length) {
    const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'device_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  const { error: expiredError } = await supabase.from('integration_items').delete().eq('device_id', deviceId).in('provider', [EDGE_OF_NORWAY_PROVIDER, LINTICKET_PROVIDER]).lt('starts_at', now)
  if (expiredError) throw new Error(expiredError.message)
  return { importedCount: rows.length, zeroEvents: rows.length === 0, areaPreference: area, providerDiagnostics }
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
  const { error: itemError } = await supabase.from('integration_items').delete().eq('device_id', deviceId).in('provider', [EDGE_OF_NORWAY_PROVIDER, LINTICKET_PROVIDER])
  if (itemError) throw new Error(itemError.message)
  const { error: skipError } = await supabase.from('local_event_frame_skips').delete().eq('device_id', deviceId).eq('provider', 'local-events')
  if (skipError) throw new Error(skipError.message)
  const { error } = await supabase.from('user_integrations').delete().eq('device_id', deviceId).eq('provider', EDGE_OF_NORWAY_PROVIDER)
  if (error) throw new Error(error.message)
}
