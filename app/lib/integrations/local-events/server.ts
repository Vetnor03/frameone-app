import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'

export const LOCAL_EVENTS_PROVIDER = 'local_events'
export const EDGE_OF_NORWAY_PROVIDER_ID = 'edge-of-norway'
export const EDGE_OF_NORWAY_DISPLAY_NAME = 'Edge of Norway'
export const LOCAL_EVENTS_STATUS = 'coming_soon'
export const COMING_SOON_MESSAGE = 'Local events are coming soon.'

export type LocalEventProviderId = typeof EDGE_OF_NORWAY_PROVIDER_ID
export type LocalEventKind = 'one_off' | 'separate_session' | 'continuous'

export type NormalizedLocalEvent = {
  external_id: string
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  short_description: string | null
  organizer: string | null
  category: string | null
  source_url: string | null
  municipality_number: string | null
  source: LocalEventProviderId
  provider: LocalEventProviderId
  event_kind: LocalEventKind
  series_id?: string | null
  last_fetched_at: string
  raw?: Record<string, unknown>
}

export type LocalEventsProvider = {
  id: LocalEventProviderId
  displayName: string
  liveEndpoint: null
  supportedEventTypes: LocalEventKind[]
}

export const EDGE_OF_NORWAY_PROVIDER: LocalEventsProvider = {
  id: EDGE_OF_NORWAY_PROVIDER_ID,
  displayName: EDGE_OF_NORWAY_DISPLAY_NAME,
  liveEndpoint: null,
  supportedEventTypes: ['one_off', 'separate_session', 'continuous'],
}

export const LOCAL_EVENTS_PROVIDERS: LocalEventsProvider[] = [EDGE_OF_NORWAY_PROVIDER]

export async function syncLocalEventsForUser(userId: string, opts: { force?: boolean } = {}) {
  void userId
  void opts
  return { synced: false, status: LOCAL_EVENTS_STATUS, count: 0 }
}

export async function connectLocalEventsForUser(userId: string) {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id: userId,
        provider: LOCAL_EVENTS_PROVIDER,
        status: 'disconnected',
        encrypted_credentials: { status: LOCAL_EVENTS_STATUS },
        external_account_id: null,
        external_account_label: null,
        last_error: COMING_SOON_MESSAGE,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
  return { connected: false, status: LOCAL_EVENTS_STATUS, message: COMING_SOON_MESSAGE, providers: LOCAL_EVENTS_PROVIDERS }
}

export async function getLocalEventsStatus(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('status,external_account_label,last_sync_at,last_error')
    .eq('user_id', userId)
    .eq('provider', LOCAL_EVENTS_PROVIDER)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    provider: LOCAL_EVENTS_PROVIDER,
    connected: false,
    status: LOCAL_EVENTS_STATUS,
    account: null,
    last_sync_at: data?.last_sync_at || null,
    message: COMING_SOON_MESSAGE,
    providers: LOCAL_EVENTS_PROVIDERS,
  }
}
