import { randomBytes } from 'node:crypto'
import { decryptJson, encryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { integrationSyncDelta } from '@/app/lib/integrations/integrationSyncDelta'
import { fetchCalendarText, normalizeCalendarUrl } from './fetch.mjs'
import { parseCalendarEvents } from './parse.mjs'

export const CALENDAR_LINK_PROVIDER = 'calendar-link'
const MAX_FEEDS = 5
const STALE_MS = 30 * 60 * 1000
type Feed = { id: string; label: string; url: string }
type Credentials = { v: 1; feeds: Feed[] }
type ImportRow = {
  external_id: string; title: string; body: string | null
  starts_at: string; due_at: string; priority: number
  raw: { source: string; feed_id: string; calendar: string; all_day: boolean; date: string | null }
}

function safeLabel(value: unknown): string {
  const label = String(value || 'Calendar').trim().replace(/[\r\n\t]/g, ' ')
  if (!label || label.length > 70) throw new Error('Calendar name must be 1–70 characters')
  return label
}
function readCredentials(data: unknown): Credentials {
  const parsed = decryptJson<Credentials>(data)
  if (parsed.v !== 1 || !Array.isArray(parsed.feeds) || parsed.feeds.length > MAX_FEEDS) throw new Error('Invalid calendar connection')
  return parsed
}
async function readConnection(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('status,encrypted_credentials,last_sync_at,last_error')
    .eq('user_id', userId).eq('provider', CALENDAR_LINK_PROVIDER).maybeSingle()
  if (error) throw new Error('Could not read calendar connection')
  if (data?.status !== 'connected' || !data.encrypted_credentials) return { data, feeds: [] as Feed[] }
  return { data, feeds: readCredentials(data.encrypted_credentials).feeds }
}
export async function calendarLinkStatus(userId: string) {
  const { data, feeds } = await readConnection(userId)
  return {
    connected: feeds.length > 0,
    feeds: feeds.map(f => ({ id: f.id, label: f.label })),
    last_sync_at: data?.last_sync_at || null,
    sync_error: data?.last_error || null,
  }
}

export async function previewCalendarLink(rawUrl: unknown, rawLabel: unknown) {
  const url = normalizeCalendarUrl(rawUrl)
  const label = safeLabel(rawLabel)
  const text = await fetchCalendarText(url)
  const events = parseCalendarEvents(text, 'preview', label) as ImportRow[]
  return {
    label,
    count: events.length,
    events: events.slice(0, 5).map(event => ({
      title: event.title, starts_at: event.starts_at,
      all_day: event.raw.all_day, date: event.raw.date,
    })),
  }
}

async function fetchFeed(feed: Feed): Promise<ImportRow[]> {
  const text = await fetchCalendarText(feed.url)
  return parseCalendarEvents(text, feed.id, feed.label) as ImportRow[]
}

async function syncAll(userId: string, feeds: Feed[]) {
  const all = (await Promise.all(feeds.map(fetchFeed))).flat()
  if (all.length > 5000) throw new Error('Calendar subscription exceeds safe sync limit')
  const now = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const incoming = all.map(event => ({ ...event, user_id: userId, provider: CALENDAR_LINK_PROVIDER, updated_at: now }))
  const { data: previous, error } = await supabase.from('integration_items')
    .select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', CALENDAR_LINK_PROVIDER).limit(5001)
  if (error) throw new Error('Could not read calendar cache')
  if ((previous || []).length > 5000) throw new Error('Calendar cache exceeds safe sync limit')
  const { changed, obsoleteIds } = integrationSyncDelta(incoming, previous || [])
  for (let i = 0; i < changed.length; i += 200) {
    const { error: writeError } = await supabase.from('integration_items')
      .upsert(changed.slice(i, i + 200), { onConflict: 'user_id,provider,external_id' })
    if (writeError) throw new Error('Could not save calendar events')
  }
  for (let i = 0; i < obsoleteIds.length; i += 200) {
    const { error: removeError } = await supabase.from('integration_items').delete()
      .eq('user_id', userId).eq('provider', CALENDAR_LINK_PROVIDER)
      .in('external_id', obsoleteIds.slice(i, i + 200))
    if (removeError) throw new Error('Could not remove old calendar events')
  }
  return { itemCount: all.length, updated: changed.length, removed: obsoleteIds.length, now }
}

export async function connectCalendarLink(userId: string, rawUrl: unknown, rawLabel: unknown) {
  const url = normalizeCalendarUrl(rawUrl)
  const label = safeLabel(rawLabel)
  const { feeds } = await readConnection(userId)
  if (feeds.length >= MAX_FEEDS) throw new Error('Maximum 5 calendar links per account')
  if (feeds.some(feed => feed.url === url)) throw new Error('This calendar is already connected')
  const next = [...feeds, { id: randomBytes(10).toString('hex'), label, url }]
  // Validate and parse every feed before changing any persistent connection.
  const synced = await syncAll(userId, next)
  const { error } = await getSupabaseAdmin().from('user_integrations').upsert({
    user_id: userId, provider: CALENDAR_LINK_PROVIDER, status: 'connected',
    encrypted_credentials: encryptJson({ v: 1, feeds: next } satisfies Credentials),
    external_account_id: null, external_account_label: next.length + ' calendars',
    last_sync_at: synced.now, last_error: null, updated_at: synced.now,
  }, { onConflict: 'user_id,provider' })
  if (error) throw new Error('Could not save calendar connection')
  return { connected: true, feeds: next.map(f => ({ id: f.id, label: f.label })), itemCount: synced.itemCount }
}

export async function removeCalendarFeed(userId: string, feedId: unknown) {
  if (typeof feedId !== 'string' || !/^[a-f0-9]{20}$/.test(feedId)) throw new Error('Invalid calendar')
  const { feeds } = await readConnection(userId)
  if (!feeds.some(feed => feed.id === feedId)) throw new Error('Calendar is not connected')
  const remaining = feeds.filter(feed => feed.id !== feedId)
  const supabase = getSupabaseAdmin()
  const { error: deleteError } = await supabase.from('integration_items').delete()
    .eq('user_id', userId).eq('provider', CALENDAR_LINK_PROVIDER)
    .like('external_id', feedId + ':%')
  if (deleteError) throw new Error('Could not remove calendar events')
  const now = new Date().toISOString()
  const { error } = await supabase.from('user_integrations').upsert({
    user_id: userId, provider: CALENDAR_LINK_PROVIDER,
    status: remaining.length ? 'connected' : 'disconnected',
    encrypted_credentials: remaining.length ? encryptJson({ v: 1, feeds: remaining } satisfies Credentials) : null,
    external_account_id: null, external_account_label: remaining.length ? remaining.length + ' calendars' : null,
    last_sync_at: remaining.length ? now : null, last_error: null, updated_at: now,
  }, { onConflict: 'user_id,provider' })
  if (error) throw new Error('Could not update calendar connection')
  return { connected: remaining.length > 0, feeds: remaining.map(f => ({ id: f.id, label: f.label })) }
}

const flights = new Map<string, Promise<{ connected: boolean; refreshed: boolean; itemCount?: number }>>()
export async function syncCalendarLinksFromStoredConnection(userId: string, options: { force?: boolean } = {}) {
  const inflight = flights.get(userId)
  if (inflight) return inflight
  const operation = (async () => {
    const { data, feeds } = await readConnection(userId)
    if (!feeds.length) return { connected: false, refreshed: false }
    const last = Date.parse(String(data?.last_sync_at || ''))
    if (!options.force && Number.isFinite(last) && Date.now() - last < STALE_MS) return { connected: true, refreshed: false }
    try {
      const synced = await syncAll(userId, feeds)
      const { error } = await getSupabaseAdmin().from('user_integrations').update({
        last_sync_at: synced.now, last_error: null, updated_at: synced.now,
      }).eq('user_id', userId).eq('provider', CALENDAR_LINK_PROVIDER).eq('status', 'connected')
      if (error) throw new Error('Could not record calendar synchronization')
      return { connected: true, refreshed: true, itemCount: synced.itemCount }
    } catch {
      // Never persist token-bearing URLs or upstream error messages.
      await getSupabaseAdmin().from('user_integrations').update({ last_error: 'Calendar sync failed; existing events retained' })
        .eq('user_id', userId).eq('provider', CALENDAR_LINK_PROVIDER)
      throw new Error('Calendar sync failed; existing events retained')
    }
  })()
  flights.set(userId, operation)
  try { return await operation } finally { if (flights.get(userId) === operation) flights.delete(userId) }
}
