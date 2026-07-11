import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { EDGE_OF_NORWAY_CITY_OPTIONS, EDGE_OF_NORWAY_PROVIDER_ID as EDGE_PROVIDER_ID, EDGE_OF_NORWAY_SOURCE_PAGES, fetchEdgeOfNorwaySourcePage, mergeRegionalEvents, parseEdgeOfNorwayListPageWithStats } from './edge-of-norway-provider'

export const LOCAL_EVENTS_PROVIDER = 'local_events'
export const EDGE_OF_NORWAY_PROVIDER_ID = EDGE_PROVIDER_ID
export const EDGE_OF_NORWAY_DISPLAY_NAME = 'Edge of Norway'
export const LOCAL_EVENTS_STATUS = 'connected'

const detailPageCache = new Map<string, { html: string; fetchedAt: number }>()
const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

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
  const now = new Date().toISOString()

  try {
    const pageResults = await Promise.all(
      EDGE_OF_NORWAY_SOURCE_PAGES.map(async (page) => {
        const result = await fetchEdgeOfNorwaySourcePage(page.url)
        if (result.status < 200 || result.status >= 300) throw new Error(`Edge of Norway returned ${result.status}`)
        return { page, result }
      }),
    )

    const parsedPages = pageResults.map(({ page, result }) => parseEdgeOfNorwayListPageWithStats(result.html, page.slug, { requestUrl: page.url, status: result.status }))
    const pageParseStats = parsedPages.map((parsed) => parsed.stats)
    for (const pageStats of pageParseStats) console.info('Edge of Norway local events parse stats', pageStats)
    const cards = parsedPages.flatMap((parsed) => parsed.cards)
    const uniqueCanonicalUrls = [...new Set(cards.map((card) => card.canonicalUrl))]
    let detailPagesRequested = 0
    let detailPagesSucceeded = 0
    let detailPagesFailed = 0
    const detailResults = await mapWithConcurrency(uniqueCanonicalUrls, 3, async (url) => {
      const cached = detailPageCache.get(url)
      if (cached && Date.now() - cached.fetchedAt < DETAIL_CACHE_TTL_MS) return [url, cached.html] as const
      detailPagesRequested += 1
      try {
        const result = await fetchEdgeOfNorwaySourcePage(url)
        if (result.status >= 200 && result.status < 300 && result.html) {
          detailPagesSucceeded += 1
          detailPageCache.set(url, { html: result.html, fetchedAt: Date.now() })
          return [url, result.html] as const
        }
        detailPagesFailed += 1
        return [url, ''] as const
      } catch {
        detailPagesFailed += 1
        return [url, ''] as const
      }
    })
    const details = Object.fromEntries(detailResults.filter(([, html]) => html))
    const { occurrences, stats } = mergeRegionalEvents(cards, details)
    const diagnostics = {
      listCardsDiscovered: cards.length,
      uniqueCanonicalEvents: uniqueCanonicalUrls.length,
      detailPagesRequested,
      detailPagesSucceeded,
      detailPagesFailed,
      datesFromJsonLd: stats.datesFromJsonLd,
      datesFromEmbeddedData: stats.datesFromEmbeddedData,
      datesFromShowingsHtml: stats.datesFromShowingsHtml,
      datesFromListFallback: stats.datesFromListFallback,
      oneOffCount: stats.oneOffCount,
      sessionCount: stats.separateSessionCount,
      continuousCount: stats.continuousCount,
      normalizedItems: occurrences.length,
      upsertedItems: 0,
    }
    console.info('Edge of Norway local events sync diagnostics', diagnostics)
    for (const place of EDGE_OF_NORWAY_CITY_OPTIONS.map((city) => city.slug)) {
      const example = occurrences.find((event) => event.sourcePlaces.includes(place))
      if (example) console.info('Edge of Norway sanitized normalized example', { place, title: example.title, date: example.date, endDate: example.endDate, startTime: example.startTime, classification: example.classification, sourceUrl: example.canonicalUrl })
    }
    if (cards.length < 20 || occurrences.length < 10) throw new Error(`Edge of Norway parsed an implausibly low event set (${cards.length} cards/${occurrences.length} occurrences); refusing to delete existing local events. Page stats: ${JSON.stringify(pageParseStats)}`)
    const rows = occurrences.map((event) => ({
      user_id: userId,
      provider: LOCAL_EVENTS_PROVIDER,
      external_id: event.occurrenceId,
      title: event.title,
      body: null,
      starts_at: event.startsAt,
      due_at: event.endsAt,
      priority: 0,
      raw: {
        source: LOCAL_EVENTS_PROVIDER,
        provider: EDGE_OF_NORWAY_PROVIDER_ID,
        external_provider: event.provider,
        base_event_id: event.baseEventId,
        event_kind: event.classification,
        all_day: event.allDay,
        source_url: event.canonicalUrl,
        source_places: event.sourcePlaces,
        date: event.date,
        end_date: event.endDate,
        start_time: event.startTime,
        end_time: event.endTime,
      },
      updated_at: now,
    }))

    const { error: upsertError } = await supabase
      .from('integration_items')
      .upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (upsertError) throw new Error(upsertError.message)

    const externalIdList = rows.map((row) => `"${String(row.external_id).replace(/"/g, '\\"')}"`).join(',')
    const { error: deleteError } = await supabase
      .from('integration_items')
      .delete()
      .eq('user_id', userId)
      .eq('provider', LOCAL_EVENTS_PROVIDER)
      .not('external_id', 'in', `(${externalIdList})`)
    if (deleteError) throw new Error(deleteError.message)

    diagnostics.upsertedItems = rows.length
    console.info('Edge of Norway local events upsert diagnostics', diagnostics)
    return { synced: true, status: LOCAL_EVENTS_STATUS, count: rows.length, source_pages: EDGE_OF_NORWAY_SOURCE_PAGES.map((p) => p.url), stats: { ...stats, ...diagnostics, detailPagesFetched: Object.keys(details).length, rowsUpserted: rows.length, sqlRequired: false, pageParseStats } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync local events'
    await supabase
      .from('user_integrations')
      .upsert({
        user_id: userId,
        provider: LOCAL_EVENTS_PROVIDER,
        status: 'error',
        last_error: message,
        updated_at: now,
      }, { onConflict: 'user_id,provider' })
    throw error
  }
}

export function normalizeLocalEventsCityPreference(city: string | null | undefined) {
  const normalized = String(city || '').trim().toLowerCase()
  return EDGE_OF_NORWAY_CITY_OPTIONS.some((option) => option.slug === normalized) ? normalized : 'stavanger'
}

export async function connectLocalEventsForUser(userId: string, opts: { selectedCity?: string } = {}) {
  const supabase = getSupabaseAdmin()
  const selectedCity = normalizeLocalEventsCityPreference(opts.selectedCity)
  const initialNow = new Date().toISOString()
  const { error: preferenceError } = await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id: userId,
        provider: LOCAL_EVENTS_PROVIDER,
        status: 'disconnected',
        encrypted_credentials: { selected_city: selectedCity, provider: EDGE_OF_NORWAY_PROVIDER_ID },
        external_account_id: EDGE_OF_NORWAY_PROVIDER_ID,
        external_account_label: EDGE_OF_NORWAY_DISPLAY_NAME,
        updated_at: initialNow,
      },
      { onConflict: 'user_id,provider' },
    )
  if (preferenceError) throw new Error(preferenceError.message)

  const sync = await syncLocalEventsForUser(userId, { force: true })
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id: userId,
        provider: LOCAL_EVENTS_PROVIDER,
        status: 'connected',
        encrypted_credentials: { selected_city: selectedCity, provider: EDGE_OF_NORWAY_PROVIDER_ID },
        external_account_id: EDGE_OF_NORWAY_PROVIDER_ID,
        external_account_label: EDGE_OF_NORWAY_DISPLAY_NAME,
        last_sync_at: now,
        last_error: null,
        updated_at: now,
      },
      { onConflict: 'user_id,provider' },
    )
  if (error) throw new Error(error.message)
  return { connected: true, status: LOCAL_EVENTS_STATUS, message: null, providers: LOCAL_EVENTS_PROVIDERS, selected_city: selectedCity, count: sync.count }
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
    upcoming_count: await getUpcomingLocalEventsCount(userId),
  }
}

async function getUpcomingLocalEventsCount(userId: string) {
  const supabase = getSupabaseAdmin()
  const { count, error } = await supabase
    .from('integration_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('provider', LOCAL_EVENTS_PROVIDER)
    .gte('starts_at', new Date().toISOString())
  if (error) return null
  return count
}
