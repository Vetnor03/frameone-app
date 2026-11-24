import { decryptJson, encryptJson } from '@/app/lib/integrations/credentialsCrypto'
import { getAuthenticatedUserId, getBearerToken, getSupabaseAdmin } from '@/app/lib/integrations/spond/server'
import {
  fetchMicrosoftCalendars,
  fetchSelectedMicrosoftCalendarEvents,
  fetchMicrosoftProfile,
  refreshMicrosoftToken,
  type TeamsMeeting,
  type TeamsStoredCredentials,
} from './client'
import { isTeamsMeetingVisibleAt } from './visibility'
import { integrationSyncDelta } from '../integrationSyncDelta'

export const TEAMS_PROVIDER = 'teams'
export const DEFAULT_TEAMS_CALENDAR_HORIZON_DAYS = 120
const DEFAULT_TZ = 'Europe/Oslo'

type TeamsOAuthState = {
  v: 1
  user_id: string
  time_zone: string
  created_at: string
  purpose?: 'microsoft-todo'
  nonce?: string
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

export function buildTeamsOAuthState(userId: string, timeZone: string, purpose?: 'microsoft-todo', nonce?: string) {
  return Buffer.from(JSON.stringify(encryptJson({
    v: 1,
    user_id: userId,
    time_zone: normalizeTimeZone(timeZone),
    created_at: new Date().toISOString(),
    ...(purpose ? { purpose, nonce } : {}),
  } satisfies TeamsOAuthState)), 'utf8').toString('base64url')
}

export function parseTeamsOAuthState(raw: string) {
  const encrypted = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  const state = decryptJson<TeamsOAuthState>(encrypted)
  if (state.v !== 1 || !state.user_id) throw new Error('Invalid Microsoft OAuth state')
  if (state.purpose && (state.purpose !== 'microsoft-todo' || !state.nonce)) throw new Error('Invalid Microsoft OAuth purpose')
  const createdAt = new Date(state.created_at).getTime()
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 15 * 60 * 1000) throw new Error('Microsoft OAuth state expired')
  return { ...state, time_zone: normalizeTimeZone(state.time_zone) }
}

async function refreshIfNeeded(credentials: TeamsStoredCredentials) {
  const expiresAt = new Date(credentials.expires_at).getTime()
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 2 * 60 * 1000) return credentials
  // Never persist a refreshed token over a concurrently changed selection.
  return { ...credentials, ...await refreshMicrosoftToken(credentials) }
}

class OutlookCalendarSyncConflict extends Error {
  constructor() { super('Outlook calendar connection changed during sync; retry the operation') }
}

async function readTeamsConnectionRevision(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('updated_at').eq('user_id', userId).eq('provider', TEAMS_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.updated_at ?? null
}

export async function syncTeamsForUser(userId: string, tokenSet: TeamsStoredCredentials, timeZone: string, options: { horizonDays?: number; expectedRevision?: string | null } = {}) {
  const supabase = getSupabaseAdmin()
  // Capture the version before contacting Graph, including first connection.
  const expectedRevision = options.expectedRevision === undefined ? await readTeamsConnectionRevision(userId) : options.expectedRevision
  const safeTimeZone = normalizeTimeZone(timeZone)
  const credentials: TeamsStoredCredentials = { ...tokenSet, time_zone: safeTimeZone }
  const profile = await fetchMicrosoftProfile(credentials.access_token)
  const horizonDays = options.horizonDays ?? DEFAULT_TEAMS_CALENDAR_HORIZON_DAYS
  const { startIso, endIso } = calendarUtcRange(safeTimeZone, horizonDays)
  const meetings = await fetchSelectedMicrosoftCalendarEvents(credentials.access_token, startIso, endIso, credentials.calendar_ids)
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

  // Never delete/reinsert unchanged meetings. Integration rows trigger a
  // physical-frame revision for every write, even when the meeting is identical.
  const existing = []
  // PostgREST's per-request row limit can be below our sync safety limit.
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error } = await supabase.from('integration_items')
      .select('external_id,title,body,starts_at,due_at,priority,raw')
      .eq('user_id', userId).eq('provider', TEAMS_PROVIDER)
      .order('external_id', { ascending: true }).range(offset, offset + 499)
    if (error) throw new Error(error.message)
    existing.push(...(data || []))
    if ((data || []).length < 500) break
  }
  if (existing.length >= 5000 || rows.length >= 5000) throw new Error('Outlook calendar cache exceeds safe sync limit')
  const { changed, obsoleteIds } = integrationSyncDelta(rows, existing)

  const email = typeof profile.mail === 'string' && profile.mail ? profile.mail : typeof profile.userPrincipalName === 'string' ? profile.userPrincipalName : null
  const label = (typeof profile.displayName === 'string' && profile.displayName.trim()) || email
  // The database locks the account, compares the captured revision, and commits
  // credentials and the complete cache delta together. Old syncs cannot restore a deselected calendar.
  const { data, error } = await supabase.rpc('commit_outlook_calendar_sync', {
    p_user_id: userId,
    p_expected_revision: expectedRevision,
    p_credentials: encryptJson(credentials),
    p_account_id: typeof profile.id === 'string' ? profile.id : null,
    p_account_label: label,
    p_changed: changed,
    p_obsolete_ids: obsoleteIds,
  })
  if (error) throw new Error(error.message)
  if (data !== true) throw new OutlookCalendarSyncConflict()
  return { integration: { provider: TEAMS_PROVIDER, status: 'connected', external_account_label: label, last_sync_at: now }, meetings }
}

export async function syncTeamsFromStoredConnection(userId: string, options: { horizonDays?: number } = {}) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('encrypted_credentials,status,updated_at')
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return { connected: false, meetings: [] as TeamsMeeting[] }

  try {
    const stored = decryptJson<TeamsStoredCredentials>(data.encrypted_credentials)
    const credentials = await refreshIfNeeded(stored)
    const result = await syncTeamsForUser(userId, credentials, credentials.time_zone || DEFAULT_TZ, { ...options, expectedRevision: data.updated_at })
    return { connected: true, meetings: result.meetings }
  } catch (error) {
    if (error instanceof OutlookCalendarSyncConflict) throw error
    await supabase
      .from('user_integrations')
      .update({ last_error: error instanceof Error ? error.message : 'Failed to sync Teams', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', TEAMS_PROVIDER)
      .eq('updated_at', data.updated_at)
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

async function getOutlookCalendarCredentials(userId: string) {
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .select('encrypted_credentials,status,updated_at').eq('user_id', userId).eq('provider', TEAMS_PROVIDER).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return null
  return { credentials: await refreshIfNeeded(decryptJson<TeamsStoredCredentials>(data.encrypted_credentials)), expectedRevision: data.updated_at as string }
}

export async function getOutlookCalendarSelection(userId: string) {
  const connection = await getOutlookCalendarCredentials(userId)
  if (!connection) return null
  const { credentials } = connection
  const calendars = await fetchMicrosoftCalendars(credentials.access_token)
  const selectedIds = credentials.calendar_ids ?? calendars.filter(calendar => calendar.isDefaultCalendar).map(calendar => calendar.id)
  return { calendars, selectedIds }
}

export async function saveOutlookCalendarSelection(userId: string, ids: string[]) {
  const connection = await getOutlookCalendarCredentials(userId)
  if (!connection) return null
  const { credentials } = connection
  const calendars = await fetchMicrosoftCalendars(credentials.access_token)
  const selectedIds = [...new Set(ids)]
  if (!selectedIds.length || selectedIds.length > 20 || selectedIds.some(id => !calendars.some(calendar => calendar.id === id))) {
    return { invalid: true as const }
  }
  // Fetch every chosen calendar successfully before reconciling the cached events.
  // The persisted selection lives in the existing encrypted provider credentials.
  await syncTeamsForUser(userId, { ...credentials, calendar_ids: selectedIds }, credentials.time_zone || DEFAULT_TZ, { expectedRevision: connection.expectedRevision })
  return { calendars, selectedIds }
}
