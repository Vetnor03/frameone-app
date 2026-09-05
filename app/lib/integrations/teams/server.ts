import { decryptJson, encryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getAuthenticatedUserId, getBearerToken, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import {
  fetchMicrosoftCalendarView,
  fetchMicrosoftProfile,
  refreshMicrosoftToken,
  type TeamsMeeting,
  type TeamsStoredCredentials,
  type TeamsTokenSet,
} from './client'
import { isTeamsMeetingVisibleAt } from './visibility'

export const TEAMS_PROVIDER = 'teams'
const DEFAULT_TZ = 'Europe/Oslo'

type TeamsOAuthState = {
  v: 1
  user_id: string
  time_zone: string
  created_at: string
}

export function publicTeamsIntegrationStatus(row: Record<string, unknown> | null) {
  return {
    provider: TEAMS_PROVIDER,
    connected: row?.status === 'connected',
    status: row?.status || 'disconnected',
    account: row?.external_account_label || null,
    last_sync_at: row?.last_sync_at || null,
    updated_at: row?.updated_at || null,
  }
}

export function normalizeTimeZone(value: unknown) {
  const timeZone = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_TZ
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return DEFAULT_TZ
  }
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
    day: Number(parts.find((p) => p.type === 'day')?.value),
  }
}

function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcGuess)
  const asNumber = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const renderedUtc = Date.UTC(asNumber('year'), asNumber('month') - 1, asNumber('day'), asNumber('hour'), asNumber('minute'), asNumber('second'))
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  return new Date(utcGuess.getTime() + (targetUtc - renderedUtc))
}

export function calendarUtcRange(timeZone: string, horizonDays = 0, now = new Date()) {
  const safeHorizonDays = Number.isFinite(horizonDays) && horizonDays > 0 ? Math.floor(horizonDays) : 0
  const { year, month, day } = getDatePartsInTimeZone(now, timeZone)
  const start = zonedWallTimeToUtc(year, month, day, 0, 0, 0, timeZone)
  const end = zonedWallTimeToUtc(year, month, day + safeHorizonDays + 1, 0, 0, 0, timeZone)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export function todayUtcRange(timeZone: string, now = new Date()) {
  return calendarUtcRange(timeZone, 0, now)
}

export async function getAuthenticatedTeamsUserId(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (userId) return userId

  const url = new URL(req.url)
  const token = url.searchParams.get('access_token') || url.searchParams.get('token')
  if (!token) return null
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

export function buildTeamsOAuthState(userId: string, timeZone: string) {
  return Buffer.from(JSON.stringify(encryptJson({
    v: 1,
    user_id: userId,
    time_zone: normalizeTimeZone(timeZone),
    created_at: new Date().toISOString(),
  } satisfies TeamsOAuthState)), 'utf8').toString('base64url')
}

export function parseTeamsOAuthState(raw: string) {
  const encrypted = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  const state = decryptJson<TeamsOAuthState>(encrypted)
  if (state.v !== 1 || !state.user_id) throw new Error('Invalid Microsoft OAuth state')
  const createdAt = new Date(state.created_at).getTime()
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 15 * 60 * 1000) throw new Error('Microsoft OAuth state expired')
  return { ...state, time_zone: normalizeTimeZone(state.time_zone) }
}

async function refreshIfNeeded(userId: string, credentials: TeamsStoredCredentials) {
  const expiresAt = new Date(credentials.expires_at).getTime()
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 2 * 60 * 1000) return credentials

  const refreshed = await refreshMicrosoftToken(credentials)
  const next = { ...credentials, ...refreshed }
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('user_integrations')
    .update({ encrypted_credentials: encryptJson(next), updated_at: new Date().toISOString(), last_error: null })
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (error) throw new Error(error.message)
  return next
}

export async function syncTeamsForUser(userId: string, tokenSet: TeamsTokenSet, timeZone: string, options: { horizonDays?: number } = {}) {
  const supabase = getSupabaseAdmin()
  const safeTimeZone = normalizeTimeZone(timeZone)
  const credentials: TeamsStoredCredentials = { ...tokenSet, time_zone: safeTimeZone }
  const profile = await fetchMicrosoftProfile(credentials.access_token)
  const { startIso, endIso } = calendarUtcRange(safeTimeZone, options.horizonDays)
  const meetings = await fetchMicrosoftCalendarView(credentials.access_token, startIso, endIso)
  const now = new Date().toISOString()

  const rows = meetings.map((meeting) => ({
    user_id: userId,
    provider: TEAMS_PROVIDER,
    external_id: meeting.id,
    title: meeting.title,
    body: meeting.location,
    starts_at: meeting.starts_at,
    due_at: meeting.ends_at,
    priority: 0,
    raw: {
      location: meeting.location,
      is_online_meeting: meeting.is_online_meeting,
      source: 'teams',
      graph: meeting.raw,
    },
    updated_at: now,
  }))

  const { error: deleteError } = await supabase
    .from('integration_items')
    .delete()
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (deleteError) throw new Error(deleteError.message)

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('integration_items')
      .upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (upsertError) throw new Error(upsertError.message)
  }

  const email = typeof profile.mail === 'string' && profile.mail ? profile.mail : typeof profile.userPrincipalName === 'string' ? profile.userPrincipalName : null
  const label = (typeof profile.displayName === 'string' && profile.displayName.trim()) || email
  const { data, error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id: userId,
      provider: TEAMS_PROVIDER,
      status: 'connected',
      encrypted_credentials: encryptJson(credentials),
      external_account_id: typeof profile.id === 'string' ? profile.id : null,
      external_account_label: label,
      last_sync_at: now,
      last_error: null,
      updated_at: now,
    }, { onConflict: 'user_id,provider' })
    .select('provider,status,external_account_label,last_sync_at,updated_at')
    .single()
  if (error) throw new Error(error.message)
  return { integration: data, meetings }
}

export async function syncTeamsFromStoredConnection(userId: string, options: { horizonDays?: number } = {}) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('encrypted_credentials,status')
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return { connected: false, meetings: [] as TeamsMeeting[] }

  try {
    const stored = decryptJson<TeamsStoredCredentials>(data.encrypted_credentials)
    const credentials = await refreshIfNeeded(userId, stored)
    const result = await syncTeamsForUser(userId, credentials, credentials.time_zone || DEFAULT_TZ, options)
    return { connected: true, meetings: result.meetings }
  } catch (error) {
    await supabase
      .from('user_integrations')
      .update({ last_error: error instanceof Error ? error.message : 'Failed to sync Teams', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', TEAMS_PROVIDER)
    throw error
  }
}

export async function syncTeamsIfStaleForUser(
  userId: string,
  options: { horizonDays?: number; staleAfterMs?: number; now?: Date } = {}
) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('status,last_sync_at')
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return { connected: false, refreshed: false }

  const now = options.now ?? new Date()
  const lastSync = Date.parse(String(data.last_sync_at || ''))
  const staleAfterMs = Math.max(60_000, options.staleAfterMs ?? 60 * 60 * 1000)
  if (Number.isFinite(lastSync) && now.getTime() - lastSync < staleAfterMs) {
    return { connected: true, refreshed: false }
  }
  await syncTeamsFromStoredConnection(userId, { horizonDays: options.horizonDays })
  return { connected: true, refreshed: true }
}

export async function getTeamsMeetingsForUser(userId: string, shouldSync = true, options: { horizonDays?: number } = {}) {
  if (shouldSync) {
    try {
      await syncTeamsFromStoredConnection(userId, options)
    } catch {
      // Fall back to cached meetings when Microsoft Graph is temporarily unavailable.
    }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('integration_items')
    .select('external_id,title,body,starts_at,due_at,raw')
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
    .order('starts_at', { ascending: true })
  if (error) throw new Error(error.message)

  return (Array.isArray(data) ? data : [])
    .map((row: Record<string, unknown>) => {
      const raw = row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw) ? row.raw as Record<string, unknown> : {}
      const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
      const endsAt = typeof row.due_at === 'string' && row.due_at ? row.due_at : startsAt
      if (!startsAt || !isTeamsMeetingVisibleAt(startsAt)) return null
      return {
        id: String(row.external_id || ''),
        title: String(row.title || 'Meeting'),
        starts_at: startsAt,
        ends_at: endsAt,
        location: typeof row.body === 'string' && row.body ? row.body : null,
        is_online_meeting: raw.is_online_meeting === true,
        source: 'teams' as const,
      }
    })
    .filter((item): item is TeamsMeeting => Boolean(item))
}

export function bearerOrQueryAccessToken(req: Request) {
  return getBearerToken(req) || new URL(req.url).searchParams.get('access_token') || ''
}
