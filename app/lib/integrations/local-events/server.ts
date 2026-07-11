import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { getLocalEvents, type LocalEventFilter, type NormalizedLocalEvent } from './providers/stavanger-friskus'

export const LOCAL_EVENTS_PROVIDER = 'local_events'
export const STAVANGER_NUMBER = '1103'
export const UNSUPPORTED_MESSAGE = 'Local events are not supported for this municipality yet.'
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
const HORIZON_DAYS = 14

export const MUNICIPALITIES = [
  { municipality_number: '1103', municipality_name: 'Stavanger', supported: true },
  { municipality_number: '1108', municipality_name: 'Sandnes', supported: false },
  { municipality_number: '0301', municipality_name: 'Oslo', supported: false },
  { municipality_number: '4601', municipality_name: 'Bergen', supported: false },
  { municipality_number: '5001', municipality_name: 'Trondheim', supported: false },
]

function filters(value: unknown): LocalEventFilter[] {
  const allowed = new Set(['all', 'children_family', 'culture', 'sport_outdoor', 'other'])
  const arr = Array.isArray(value) ? value : ['all']
  const clean = arr.map((x) => String(x)).filter((x): x is LocalEventFilter => allowed.has(x))
  return clean.length ? clean : ['all']
}

function addDays(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d }

function matchesFilter(event: NormalizedLocalEvent, selected: LocalEventFilter[]) {
  return selected.includes('all') || (!!event.category && selected.includes(event.category))
}

async function upsertEvents(userId: string, events: NormalizedLocalEvent[], selectedFilters: LocalEventFilter[]) {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const rows = events.filter((e) => matchesFilter(e, selectedFilters)).map((event) => ({
    user_id: userId,
    provider: LOCAL_EVENTS_PROVIDER,
    external_id: event.external_id,
    title: event.location ? `${event.title} · ${event.location}` : event.title,
    body: event.short_description,
    starts_at: event.starts_at,
    due_at: event.ends_at,
    priority: 8,
    raw: { source: LOCAL_EVENTS_PROVIDER, type: 'local_event', ...event },
    updated_at: now,
  }))
  await supabase.from('integration_items').delete().eq('user_id', userId).eq('provider', LOCAL_EVENTS_PROVIDER)
  if (rows.length) {
    const { error } = await supabase.from('integration_items').upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  return rows.length
}

export async function syncLocalEventsForUser(userId: string, opts: { force?: boolean } = {}) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('user_integrations').select('status,encrypted_credentials,last_sync_at').eq('user_id', userId).eq('provider', LOCAL_EVENTS_PROVIDER).maybeSingle()
  if (data?.status !== 'connected') return { synced: false }
  if (!opts.force && data.last_sync_at && Date.now() - new Date(data.last_sync_at).getTime() < SYNC_INTERVAL_MS) return { synced: false }
  const creds = data.encrypted_credentials && typeof data.encrypted_credentials === 'object' ? data.encrypted_credentials as any : {}
  const municipalityNumber = String(creds.municipality_number || '')
  if (municipalityNumber !== STAVANGER_NUMBER) return { synced: false }
  const selectedFilters = filters(creds.filters)
  try {
    const events = await getLocalEvents({ municipalityNumber, from: new Date(), to: addDays(HORIZON_DAYS) })
    const count = await upsertEvents(userId, events, selectedFilters)
    await supabase.from('user_integrations').upsert({ user_id: userId, provider: LOCAL_EVENTS_PROVIDER, status: 'connected', last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
    return { synced: true, count }
  } catch (error) {
    console.error('[local-events] provider sync failed', error)
    await supabase.from('user_integrations').update({ last_error: 'Provider refresh failed; using cached events.', updated_at: new Date().toISOString() }).eq('user_id', userId).eq('provider', LOCAL_EVENTS_PROVIDER)
    return { synced: false, stale: true }
  }
}

export async function connectLocalEventsForUser(userId: string, municipalityNumber: string, selected: unknown) {
  const supabase = getSupabaseAdmin()
  const municipality = MUNICIPALITIES.find((m) => m.municipality_number === municipalityNumber)
  if (!municipality?.supported) {
    await supabase.from('user_integrations').upsert({ user_id: userId, provider: LOCAL_EVENTS_PROVIDER, status: 'disconnected', encrypted_credentials: { municipality_number: municipalityNumber }, external_account_label: municipality?.municipality_name || municipalityNumber, last_error: UNSUPPORTED_MESSAGE, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
    return { connected: false, status: 'unsupported', message: UNSUPPORTED_MESSAGE, municipalities: MUNICIPALITIES }
  }
  await supabase.from('user_integrations').upsert({ user_id: userId, provider: LOCAL_EVENTS_PROVIDER, status: 'connected', encrypted_credentials: { municipality_number: municipalityNumber, filters: filters(selected) }, external_account_id: municipalityNumber, external_account_label: municipality.municipality_name, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' })
  const sync = await syncLocalEventsForUser(userId, { force: true })
  return { connected: true, status: 'connected', account: municipality.municipality_name, ...sync }
}

export async function getLocalEventsStatus(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('user_integrations').select('status,external_account_label,last_sync_at,last_error,encrypted_credentials').eq('user_id', userId).eq('provider', LOCAL_EVENTS_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return { provider: LOCAL_EVENTS_PROVIDER, connected: data?.status === 'connected', status: data?.status || 'disconnected', account: data?.external_account_label || null, last_sync_at: data?.last_sync_at || null, message: data?.last_error || null, filters: filters((data?.encrypted_credentials as any)?.filters), municipalities: MUNICIPALITIES }
}
