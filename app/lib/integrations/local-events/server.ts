import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { EDGE_OF_NORWAY_CITY_OPTIONS, EDGE_OF_NORWAY_PROVIDER_ID as EDGE_PROVIDER_ID, EDGE_OF_NORWAY_SOURCE_PAGES } from './edge-of-norway-provider'

export const LOCAL_EVENTS_PROVIDER = 'local_events'
export const EDGE_OF_NORWAY_PROVIDER_ID = EDGE_PROVIDER_ID
export const EDGE_OF_NORWAY_DISPLAY_NAME = 'Edge of Norway'
export const LOCAL_EVENTS_STATUS = 'connected'
export const COMING_SOON_MESSAGE = 'Local events are available.'

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
  cityOptions: Array<{ slug: string; label: string }>
}

export const EDGE_OF_NORWAY_PROVIDER: LocalEventsProvider = {
  id: EDGE_OF_NORWAY_PROVIDER_ID,
  displayName: EDGE_OF_NORWAY_DISPLAY_NAME,
  liveEndpoint: null,
  supportedEventTypes: ['one_off', 'separate_session', 'continuous'],
  cityOptions: EDGE_OF_NORWAY_CITY_OPTIONS.map(({ slug, label }) => ({ slug, label })),
}

export const LOCAL_EVENTS_PROVIDERS: LocalEventsProvider[] = [EDGE_OF_NORWAY_PROVIDER]

export async function syncLocalEventsForUser(userId: string, opts: { force?: boolean } = {}) {
  void opts
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('integration_items').select('id').eq('user_id', userId).eq('provider', LOCAL_EVENTS_PROVIDER)
  return { synced: true, status: LOCAL_EVENTS_STATUS, count: data?.length || 0, source_pages: EDGE_OF_NORWAY_SOURCE_PAGES.map((p) => p.url) }
}

export function normalizeLocalEventsCityPreference(city: string | null | undefined) {
  const normalized = String(city || '').trim().toLowerCase()
  return EDGE_OF_NORWAY_CITY_OPTIONS.some((option) => option.slug === normalized) ? normalized : 'stavanger'
}

export async function connectLocalEventsForUser(userId: string, opts: { selectedCity?: string } = {}) {
  const supabase = getSupabaseAdmin()
  await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id: userId,
        provider: LOCAL_EVENTS_PROVIDER,
        status: 'connected',
        encrypted_credentials: { selected_city: normalizeLocalEventsCityPreference(opts.selectedCity), provider: EDGE_OF_NORWAY_PROVIDER_ID },
        external_account_id: EDGE_OF_NORWAY_PROVIDER_ID,
        external_account_label: EDGE_OF_NORWAY_DISPLAY_NAME,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
  return { connected: true, status: LOCAL_EVENTS_STATUS, message: null, providers: LOCAL_EVENTS_PROVIDERS, selected_city: normalizeLocalEventsCityPreference(opts.selectedCity) }
}

export async function getLocalEventsStatus(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('status,external_account_label,last_sync_at,last_error,encrypted_credentials')
    .eq('user_id', userId)
    .eq('provider', LOCAL_EVENTS_PROVIDER)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    provider: LOCAL_EVENTS_PROVIDER,
    connected: data?.status === 'connected',
    status: data?.status || LOCAL_EVENTS_STATUS,
    account: data?.external_account_label || EDGE_OF_NORWAY_DISPLAY_NAME,
    last_sync_at: data?.last_sync_at || null,
    message: data?.last_error || null,
    providers: LOCAL_EVENTS_PROVIDERS,
    selected_city: normalizeLocalEventsCityPreference((data as any)?.encrypted_credentials?.selected_city),
  }
}
