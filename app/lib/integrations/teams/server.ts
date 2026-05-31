import { createClient } from '@supabase/supabase-js'
import { decryptJson, encryptJson } from '@/app/lib/integrations/crypto'

export const TEAMS_PROVIDER = 'teams'

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const MICROSOFT_SCOPES = ['offline_access', 'Calendars.Read', 'User.Read']

export type TeamsTokenSet = {
  accessToken: string
  refreshToken: string
  expiresAt: string
  scope?: string
  tokenType?: string
}

export type NormalizedMeeting = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  location: string | null
  is_online_meeting: boolean
  source: 'teams'
}

type GraphDateTime = {
  dateTime?: unknown
  timeZone?: unknown
}

type GraphEvent = {
  id?: unknown
  subject?: unknown
  start?: GraphDateTime
  end?: GraphDateTime
  location?: { displayName?: unknown }
  locations?: Array<{ displayName?: unknown }>
  isOnlineMeeting?: unknown
  onlineMeeting?: { joinUrl?: unknown }
  onlineMeetingProvider?: unknown
  webLink?: unknown
  isCancelled?: unknown
}

type TokenResponse = {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  scope?: unknown
  token_type?: unknown
  error?: unknown
  error_description?: unknown
}

function cleanString(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function microsoftScopes() {
  return MICROSOFT_SCOPES.join(' ')
}

export function microsoftAuthorizeUrl(state: string) {
  const url = new URL(MICROSOFT_AUTH_URL)
  url.searchParams.set('client_id', requiredEnv('MICROSOFT_CLIENT_ID'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', requiredEnv('MICROSOFT_REDIRECT_URI'))
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', microsoftScopes())
  url.searchParams.set('state', state)
  return url.toString()
}

async function postTokenForm(params: URLSearchParams) {
  const resp = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    cache: 'no-store',
  })
  const data = (await resp.json().catch(() => ({}))) as TokenResponse
  if (!resp.ok) {
    const details = cleanString(data.error_description, 240) || cleanString(data.error, 120) || `Microsoft token request failed (${resp.status})`
    throw new Error(details)
  }

  const accessToken = cleanString(data.access_token, 8000)
  if (!accessToken) throw new Error('Microsoft did not return an access token')
  const refreshToken = cleanString(data.refresh_token, 8000)
  const expiresIn = Number(data.expires_in ?? 3600)
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + Math.max(60, Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000).toISOString(),
    scope: cleanString(data.scope, 1000) || undefined,
    tokenType: cleanString(data.token_type, 80) || undefined,
  }
}

export async function exchangeCodeForTokens(code: string): Promise<TeamsTokenSet> {
  const params = new URLSearchParams()
  params.set('client_id', requiredEnv('MICROSOFT_CLIENT_ID'))
  params.set('client_secret', requiredEnv('MICROSOFT_CLIENT_SECRET'))
  params.set('code', code)
  params.set('redirect_uri', requiredEnv('MICROSOFT_REDIRECT_URI'))
  params.set('grant_type', 'authorization_code')
  params.set('scope', microsoftScopes())
  return postTokenForm(params)
}

export async function refreshTeamsTokens(tokens: TeamsTokenSet): Promise<TeamsTokenSet> {
  if (!tokens.refreshToken) throw new Error('Microsoft refresh token is missing')
  const params = new URLSearchParams()
  params.set('client_id', requiredEnv('MICROSOFT_CLIENT_ID'))
  params.set('client_secret', requiredEnv('MICROSOFT_CLIENT_SECRET'))
  params.set('refresh_token', tokens.refreshToken)
  params.set('grant_type', 'refresh_token')
  params.set('scope', microsoftScopes())
  const refreshed = await postTokenForm(params)
  return { ...refreshed, refreshToken: refreshed.refreshToken || tokens.refreshToken }
}

export async function ensureFreshTeamsTokens(userId: string): Promise<TeamsTokenSet | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('encrypted_credentials,status')
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.status !== 'connected') return null

  const tokens = decryptJson<TeamsTokenSet>(data.encrypted_credentials)
  const expiresMs = Date.parse(tokens.expiresAt || '')
  if (Number.isFinite(expiresMs) && expiresMs - Date.now() > 2 * 60 * 1000) return tokens

  const refreshed = await refreshTeamsTokens(tokens)
  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('user_integrations')
    .update({ encrypted_credentials: encryptJson(refreshed), last_error: null, updated_at: now })
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (updateError) throw new Error(updateError.message)
  return refreshed
}

function graphDateToIso(value: GraphDateTime | undefined) {
  const dateTime = cleanString(value?.dateTime, 80)
  if (!dateTime) return null
  const iso = dateTime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateTime) ? dateTime : `${dateTime}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function teamsLocation(event: GraphEvent) {
  const location = cleanString(event.location?.displayName, 160)
  const locations = Array.isArray(event.locations)
    ? event.locations.map((x) => cleanString(x?.displayName, 160)).filter(Boolean)
    : []
  const joined = [location, ...locations].join(' ').toLowerCase()
  const onlineProvider = cleanString(event.onlineMeetingProvider, 80).toLowerCase()
  const joinUrl = cleanString(event.onlineMeeting?.joinUrl, 1000).toLowerCase()
  const isTeams = joined.includes('teams') || onlineProvider.includes('teams') || joinUrl.includes('teams.microsoft.com')
  if (isTeams || event.isOnlineMeeting === true || joinUrl) return 'Teams'
  return location || locations[0] || null
}

function normalizeGraphEvent(event: GraphEvent): NormalizedMeeting | null {
  if (event.isCancelled === true) return null
  const id = cleanString(event.id, 300)
  const startsAt = graphDateToIso(event.start)
  const endsAt = graphDateToIso(event.end)
  const title = cleanString(event.subject, 200) || 'Untitled meeting'
  if (!id || !startsAt || !endsAt) return null
  const location = teamsLocation(event)
  const provider = cleanString(event.onlineMeetingProvider, 80).toLowerCase()
  const joinUrl = cleanString(event.onlineMeeting?.joinUrl, 1000)
  const isOnlineMeeting = event.isOnlineMeeting === true || !!joinUrl || provider.includes('teams') || String(location || '').toLowerCase() === 'teams'
  return { id, title, starts_at: startsAt, ends_at: endsAt, location, is_online_meeting: isOnlineMeeting, source: TEAMS_PROVIDER }
}

function timeZoneOffsetMs(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - date.getTime()
}

function localDateTimeToUtcIso(timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const firstPass = utcGuess - timeZoneOffsetMs(timeZone, new Date(utcGuess))
  const secondPass = utcGuess - timeZoneOffsetMs(timeZone, new Date(firstPass))
  return new Date(secondPass).toISOString()
}

function dayRangeForTimeZone(timeZone: string) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const y = get('year')
  const m = get('month')
  const d = get('day')
  const localTomorrow = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0))
  return {
    start: localDateTimeToUtcIso(timeZone, y, m, d),
    end: localDateTimeToUtcIso(timeZone, localTomorrow.getUTCFullYear(), localTomorrow.getUTCMonth() + 1, localTomorrow.getUTCDate()),
  }
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const resp = await fetch(`${GRAPH_BASE_URL}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  if (!resp.ok) throw new Error(cleanString(data.error, 160) || `Microsoft profile request failed (${resp.status})`)
  return {
    id: cleanString(data.id, 200) || null,
    label: cleanString(data.mail, 200) || cleanString(data.userPrincipalName, 200) || cleanString(data.displayName, 200) || null,
  }
}

export async function fetchTodayMicrosoftMeetings(accessToken: string, timeZone = 'Europe/Oslo') {
  const { start, end } = dayRangeForTimeZone(timeZone)
  const url = new URL(`${GRAPH_BASE_URL}/me/calendarView`)
  url.searchParams.set('startDateTime', start)
  url.searchParams.set('endDateTime', end)
  url.searchParams.set('$select', 'id,subject,start,end,location,locations,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,isCancelled')
  url.searchParams.set('$orderby', 'start/dateTime')
  url.searchParams.set('$top', '50')

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: `outlook.timezone="UTC"`,
    },
    cache: 'no-store',
  })
  const data = (await resp.json().catch(() => ({}))) as { value?: unknown; error?: { message?: unknown } } & Record<string, unknown>
  if (!resp.ok) {
    const message = cleanString(data.error?.message, 240) || `Microsoft calendar request failed (${resp.status})`
    throw new Error(message)
  }

  const value = Array.isArray(data.value) ? data.value : []
  return value
    .map((event) => normalizeGraphEvent(event as GraphEvent))
    .filter((event): event is NormalizedMeeting => !!event)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

export async function storeTeamsConnection(userId: string, tokens: TeamsTokenSet, profile: { id: string | null; label: string | null }) {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id: userId,
      provider: TEAMS_PROVIDER,
      status: 'connected',
      encrypted_credentials: encryptJson(tokens),
      external_account_id: profile.id,
      external_account_label: profile.label,
      last_error: null,
      updated_at: now,
    }, { onConflict: 'user_id,provider' })
  if (error) throw new Error(error.message)
}

export async function syncTeamsMeetingsForUser(userId: string, accessToken: string, timeZone = 'Europe/Oslo') {
  const supabase = getSupabaseAdmin()
  const meetings = await fetchTodayMicrosoftMeetings(accessToken, timeZone)
  const now = new Date().toISOString()

  const { error: deleteError } = await supabase
    .from('integration_items')
    .delete()
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (deleteError) throw new Error(deleteError.message)

  if (meetings.length > 0) {
    const rows = meetings.map((meeting) => ({
      user_id: userId,
      provider: TEAMS_PROVIDER,
      external_id: meeting.id,
      title: meeting.title,
      body: meeting.location,
      starts_at: meeting.starts_at,
      due_at: meeting.ends_at,
      priority: 0,
      raw: meeting,
      updated_at: now,
    }))
    const { error: upsertError } = await supabase
      .from('integration_items')
      .upsert(rows, { onConflict: 'user_id,provider,external_id' })
    if (upsertError) throw new Error(upsertError.message)
  }

  const { error: updateError } = await supabase
    .from('user_integrations')
    .update({ last_sync_at: now, last_error: null, updated_at: now })
    .eq('user_id', userId)
    .eq('provider', TEAMS_PROVIDER)
  if (updateError) throw new Error(updateError.message)

  return meetings
}

export async function syncTeamsFromStoredConnection(userId: string, timeZone = 'Europe/Oslo') {
  const tokens = await ensureFreshTeamsTokens(userId)
  if (!tokens) return { connected: false, meetings: [] as NormalizedMeeting[] }
  const meetings = await syncTeamsMeetingsForUser(userId, tokens.accessToken, timeZone)
  return { connected: true, meetings }
}

export function publicTeamsStatus(row: Record<string, unknown> | null) {
  return {
    provider: TEAMS_PROVIDER,
    connected: row?.status === 'connected',
    status: row?.status || 'disconnected',
    account: row?.external_account_label || null,
    last_sync_at: row?.last_sync_at || null,
    updated_at: row?.updated_at || null,
  }
}
