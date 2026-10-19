import { randomBytes, timingSafeEqual } from 'node:crypto'
import { decryptJson, encryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import { calendarUtcRange, normalizeTimeZone } from '@/app/lib/integrations/teams/server'
import { integrationSyncDelta } from '@/app/lib/integrations/integrationSyncDelta'
import {
  fetchGoogleCalendars,
  fetchGoogleEvents,
  refreshGoogleToken,
  type GoogleCredentials,
  type GoogleEvent,
  type GoogleTokenSet,
} from './client'

export const GOOGLE_CALENDAR_PROVIDER = 'google-calendar'
export const GOOGLE_CALENDAR_HORIZON_DAYS = 120
export const GOOGLE_OAUTH_COOKIE = 'remind_google_calendar_oauth'
const MAX_OAUTH_AGE_MS = 15 * 60 * 1000

type GoogleOAuthState = {
  v: 1
  user_id: string
  created_at: string
  nonce: string
  time_zone: string
}

export function makeGoogleOAuthState(userId: string, timeZone: string) {
  const nonce = randomBytes(24).toString('base64url')
  const raw = encryptJson({
    v: 1,
    user_id: userId,
    created_at: new Date().toISOString(),
    nonce,
    time_zone: normalizeTimeZone(timeZone),
  } satisfies GoogleOAuthState)
  return { state: Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url'), nonce }
}

export function verifyGoogleOAuthState(raw: string, cookieNonce: string) {
  const encrypted = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  const state = decryptJson<GoogleOAuthState>(encrypted)
  if (state.v !== 1 || !state.user_id || !state.nonce || !cookieNonce) throw new Error('Invalid Google Calendar OAuth state')
  const a = Buffer.from(state.nonce)
  const b = Buffer.from(cookieNonce)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Google Calendar OAuth state does not match this browser')
  const age = Date.now() - Date.parse(state.created_at)
  if (!Number.isFinite(age) || age < 0 || age > MAX_OAUTH_AGE_MS) throw new Error('Google Calendar OAuth request expired')
  return { userId: state.user_id, timeZone: normalizeTimeZone(state.time_zone) }
}

export function publicGoogleCalendarStatus(row: Record<string, unknown> | null) {
  return {
    provider: GOOGLE_CALENDAR_PROVIDER,
    connected: row?.status === 'connected',
    status: row?.status || 'disconnected',
    account: row?.external_account_label || null,
    last_sync_at: row?.last_sync_at || null,
  }
}

async function refreshIfNeeded(userId: string, credentials: GoogleCredentials) {
  const expiry = Date.parse(credentials.expires_at)
  if (Number.isFinite(expiry) && expiry - Date.now() > 120_000) return credentials
  const refreshed = await refreshGoogleToken(credentials)
  const next = { ...credentials, ...refreshed }
  const { error } = await getSupabaseAdmin().from('user_integrations')
    .update({ encrypted_credentials: encryptJson(next), updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('provider', GOOGLE_CALENDAR_PROVIDER).eq('status', 'connected')
  if (error) throw new Error(error.message)
  return next
}

export async function syncGoogleCalendarForUser(userId: string, credentials: GoogleCredentials, horizonDays = GOOGLE_CALENDAR_HORIZON_DAYS) {
  const supabase = getSupabaseAdmin()
  const { startIso, endIso } = calendarUtcRange(normalizeTimeZone(credentials.time_zone), horizonDays)
  const calendars = await fetchGoogleCalendars(credentials.access_token)
  const events = await fetchGoogleEvents(credentials.access_token, calendars, startIso, endIso)
  const now = new Date().toISOString()
  const incoming = events.map((event: GoogleEvent) => ({
    user_id: userId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    external_id: event.id,
    title: event.title,
    body: event.location,
    starts_at: event.starts_at,
    due_at: event.ends_at,
    priority: 0,
    raw: {
      source: GOOGLE_CALENDAR_PROVIDER,
      calendar: event.calendar,
      calendar_id: event.calendar_id,
      all_day: event.all_day,
      date: event.date,
      sourceUrl: event.source_url,
    },
    updated_at: now,
  }))
  // Do not wake frames for unchanged events; changes trigger a physical content revision.
  const { data: existing, error: existingError } = await supabase.from('integration_items')
    .select('external_id,title,body,starts_at,due_at,priority,raw')
    .eq('user_id', userId).eq('provider', GOOGLE_CALENDAR_PROVIDER).limit(5001)
  if (existingError) throw new Error(existingError.message)
  if ((existing || []).length > 5000) throw new Error('Google Calendar cache exceeds safe sync limit')
  const { changed, obsoleteIds } = integrationSyncDelta(incoming, existing || [])
  for (let index = 0; index < obsoleteIds.length; index += 200) {
    const { error } = await supabase.from('integration_items').delete()
      .eq('user_id', userId).eq('provider', GOOGLE_CALENDAR_PROVIDER)
      .in('external_id', obsoleteIds.slice(index, index + 200))
    if (error) throw new Error(error.message)
  }
  for (let index = 0; index < changed.length; index += 200) {
    const { error } = await supabase.from('integration_items')
      .upsert(changed.slice(index, index + 200), { onConflict: 'user_id,provider,external_id' })
    if (error) throw new Error(error.message)
  }
  const primary = calendars.find(c => c.primary)
  const accountLabel = primary?.id || calendars[0]?.id || 'Google Calendar'
  const { error } = await supabase.from('user_integrations').upsert({
    user_id: userId,
    provider: GOOGLE_CALENDAR_PROVIDER,
    status: 'connected',
    encrypted_credentials: encryptJson(credentials),
    external_account_id: primary?.id || null,
    external_account_label: accountLabel,
    last_sync_at: now,
    last_error: null,
    updated_at: now,
  }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
  return { eventCount: events.length, calendarCount: calendars.length }
}

export async function connectGoogleCalendarForUser(userId: string, tokens: GoogleTokenSet, timeZone: string) {
  if (!tokens.refresh_token) throw new Error('Google did not provide offline access. Please try connecting again.')
  return syncGoogleCalendarForUser(userId, { ...tokens, time_zone: normalizeTimeZone(timeZone) })
}

export async function syncGoogleCalendarFromStoredConnection(userId: string, options: { staleAfterMs?: number; force?: boolean } = {}) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('user_integrations')
    .select('status, encrypted_credentials, last_sync_at')
    .eq('user_id', userId).eq('provider', GOOGLE_CALENDAR_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return { connected: false, refreshed: false }
  const lastSync = Date.parse(String(data.last_sync_at || ''))
  const staleAfterMs = Math.max(60_000, options.staleAfterMs ?? 60 * 60 * 1000)
  if (!options.force && Number.isFinite(lastSync) && Date.now() - lastSync < staleAfterMs) {
    return { connected: true, refreshed: false }
  }
  try {
    const credentials = await refreshIfNeeded(userId, decryptJson<GoogleCredentials>(data.encrypted_credentials))
    await syncGoogleCalendarForUser(userId, credentials)
    return { connected: true, refreshed: true }
  } catch (error) {
    await supabase.from('user_integrations')
      .update({ last_error: error instanceof Error ? error.message.slice(0, 500) : 'Google Calendar sync failed' })
      .eq('user_id', userId).eq('provider', GOOGLE_CALENDAR_PROVIDER)
    throw error
  }
}
