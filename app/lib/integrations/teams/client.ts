export type TeamsTokenSet = {
  access_token: string
  refresh_token?: string
  expires_at: string
  scope?: string
  token_type?: string
}

export type TeamsStoredCredentials = TeamsTokenSet & {
  time_zone?: string
  calendar_ids?: string[]
}

export type TeamsMeeting = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  location: string | null
  is_online_meeting: boolean
  source: 'teams'
  raw?: unknown
}

type GraphEvent = {
  id?: string
  subject?: string
  isCancelled?: boolean
  isOnlineMeeting?: boolean
  onlineMeetingProvider?: string
  onlineMeeting?: { joinUrl?: string | null } | null
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  location?: { displayName?: string | null }
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/common'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const REQUIRED_MICROSOFT_ENV = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'] as const
export const TEAMS_SCOPES = ['offline_access', 'Calendars.Read', 'User.Read'] as const

export function getMicrosoftOAuthConfigStatus() {
  const missing = REQUIRED_MICROSOFT_ENV.filter((name) => !process.env[name])
  return {
    configured: missing.length === 0,
    missing,
  }
}

export function logMicrosoftOAuthConfigError(context = 'teams') {
  const status = getMicrosoftOAuthConfigStatus()
  if (status.configured) return null
  console.error(`[integrations:${context}] Microsoft OAuth setup error`, { missing: status.missing })
  return status
}

export function microsoftOAuthUserMessage() {
  return 'Outlook Calendar is not fully configured on the server yet. Contact an administrator to finish Microsoft connection setup.'
}

export function microsoftOAuthSetupError(context = 'teams') {
  const status = logMicrosoftOAuthConfigError(context)
  if (!status) return null
  return {
    code: 'missing_microsoft_oauth_config',
    message: microsoftOAuthUserMessage(),
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export function getMicrosoftRedirectUri(req?: Request) {
  if (process.env.MICROSOFT_REDIRECT_URI) return process.env.MICROSOFT_REDIRECT_URI
  if (!req) throw new Error('Missing MICROSOFT_REDIRECT_URI')
  return new URL('/api/integrations/teams/callback', req.url).toString()
}

export function buildMicrosoftAuthUrl(state: string, redirectUri: string, scopes: readonly string[] = TEAMS_SCOPES) {
  const url = new URL(`${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', requiredEnv('MICROSOFT_CLIENT_ID'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

async function parseTokenResponse(resp: Response) {
  const data = (await resp.json().catch(() => ({}))) as TokenResponse
  if (!resp.ok || !data.access_token) {
    const message = data.error_description || data.error || `Microsoft token request failed with status ${resp.status}`
    throw new Error(message)
  }
  return data
}

function toStoredTokenSet(data: TokenResponse, existingRefreshToken?: string): TeamsTokenSet {
  if (!data.access_token) throw new Error('Microsoft did not return an access token')
  const expiresInSeconds = Number(data.expires_in || 3600)
  const expiresAt = new Date(Date.now() + Math.max(60, expiresInSeconds - 60) * 1000).toISOString()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || existingRefreshToken,
    expires_at: expiresAt,
    scope: data.scope,
    token_type: data.token_type,
  }
}

export async function exchangeMicrosoftCode(code: string, redirectUri: string, scopes: readonly string[] = TEAMS_SCOPES): Promise<TeamsTokenSet> {
  const body = new URLSearchParams({
    client_id: requiredEnv('MICROSOFT_CLIENT_ID'),
    client_secret: requiredEnv('MICROSOFT_CLIENT_SECRET'),
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: scopes.join(' '),
  })

  const resp = await fetch(`${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return toStoredTokenSet(await parseTokenResponse(resp))
}

export async function refreshMicrosoftToken(credentials: TeamsStoredCredentials, scopes: readonly string[] = TEAMS_SCOPES): Promise<TeamsTokenSet> {
  if (!credentials.refresh_token) throw new Error('Microsoft connection is missing a refresh token')
  const body = new URLSearchParams({
    client_id: requiredEnv('MICROSOFT_CLIENT_ID'),
    client_secret: requiredEnv('MICROSOFT_CLIENT_SECRET'),
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
    scope: scopes.join(' '),
  })

  const resp = await fetch(`${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return toStoredTokenSet(await parseTokenResponse(resp), credentials.refresh_token)
}

function dateTimeToIso(value?: string | null) {
  if (!value) return null
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function normalizeLocation(event: GraphEvent) {
  const display = String(event.location?.displayName || '').trim()
  const joinUrl = String(event.onlineMeeting?.joinUrl || '').trim()
  const provider = String(event.onlineMeetingProvider || '').toLowerCase()
  if (event.isOnlineMeeting || joinUrl || provider.includes('teams') || /\bteams\b/i.test(display)) return 'Teams'
  return display || null
}

export function normalizeGraphEvent(event: GraphEvent): TeamsMeeting | null {
  if (!event.id || event.isCancelled) return null
  const startsAt = dateTimeToIso(event.start?.dateTime)
  const endsAt = dateTimeToIso(event.end?.dateTime) || startsAt
  if (!startsAt || !endsAt) return null
  const location = normalizeLocation(event)
  const joinUrl = String(event.onlineMeeting?.joinUrl || '').trim()
  const provider = String(event.onlineMeetingProvider || '').toLowerCase()
  return {
    id: event.id,
    title: String(event.subject || '').trim() || 'Meeting',
    starts_at: startsAt,
    ends_at: endsAt,
    location,
    is_online_meeting: Boolean(event.isOnlineMeeting || joinUrl || provider.includes('teams') || location === 'Teams'),
    source: 'teams',
    raw: event,
  }
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const resp = await fetch(`${GRAPH_BASE}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  if (!resp.ok) throw new Error(String(data.error || `Microsoft profile request failed with status ${resp.status}`))
  return data
}

export async function fetchMicrosoftCalendarView(accessToken: string, startIso: string, endIso: string, calendarId?: string): Promise<TeamsMeeting[]> {
  const url = new URL(calendarId ? `${GRAPH_BASE}/me/calendars/${encodeURIComponent(calendarId)}/calendarView` : `${GRAPH_BASE}/me/calendarView`)
  url.searchParams.set('startDateTime', startIso)
  url.searchParams.set('endDateTime', endIso)
  url.searchParams.set('$select', 'id,subject,start,end,location,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,isCancelled')
  url.searchParams.set('$orderby', 'start/dateTime')
  url.searchParams.set('$top', '50')

  const events: GraphEvent[] = []
  let nextUrl: string | null = url.toString()
  let pageCount = 0

  while (nextUrl && pageCount < 20) {
    if (new URL(nextUrl).origin !== new URL(GRAPH_BASE).origin) throw new Error('Invalid Microsoft Graph pagination URL')
    const resp = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    })
    const data = (await resp.json().catch(() => ({}))) as {
      value?: GraphEvent[]
      error?: { message?: string }
      '@odata.nextLink'?: string
    } & Record<string, unknown>
    if (!resp.ok) throw new Error(data.error?.message || `Microsoft calendar request failed with status ${resp.status}`)

    if (!Array.isArray(data.value)) throw new Error('Invalid Microsoft calendar response')
    events.push(...data.value)
    nextUrl = typeof data['@odata.nextLink'] === 'string' && data['@odata.nextLink']
      ? data['@odata.nextLink']
      : null
    pageCount += 1
  }

  if (nextUrl) throw new Error('Microsoft calendar exceeds safe pagination limit')
  return events
    .map(normalizeGraphEvent)
    .filter((item): item is TeamsMeeting => Boolean(item))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

export type OutlookCalendar = { id: string; name: string; isDefaultCalendar: boolean }

export async function fetchMicrosoftCalendars(accessToken: string): Promise<OutlookCalendar[]> {
  const url = new URL(`${GRAPH_BASE}/me/calendars`)
  url.searchParams.set('$select', 'id,name,isDefaultCalendar')
  url.searchParams.set('$top', '100')
  let next: string | null = url.toString()
  const calendars = new Map<string, OutlookCalendar>()
  for (let page = 0; next && page < 20; page++) {
    if (new URL(next).origin !== new URL(GRAPH_BASE).origin) throw new Error('Invalid Microsoft Graph pagination URL')
    const response: Response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await response.json()
    if (!response.ok || !Array.isArray(data.value)) throw new Error('Could not load Outlook calendars')
    for (const item of data.value) {
      if (typeof item.id === 'string' && item.id) calendars.set(item.id, {
        id: item.id, name: typeof item.name === 'string' && item.name ? item.name : 'Calendar',
        isDefaultCalendar: item.isDefaultCalendar === true,
      })
    }
    next = typeof data['@odata.nextLink'] === 'string' ? data['@odata.nextLink'] : null
  }
  if (next) throw new Error('Outlook calendar list exceeds safe pagination limit')
  // Some Graph accounts do not populate isDefaultCalendar on list results.
  if (![...calendars.values()].some(calendar => calendar.isDefaultCalendar)) {
    const response = await fetch(`${GRAPH_BASE}/me/calendar?$select=id,name`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await response.json()
    if (!response.ok || typeof data.id !== 'string') throw new Error('Could not identify default Outlook calendar')
    const existing = calendars.get(data.id)
    calendars.set(data.id, { id: data.id, name: existing?.name || data.name || 'Calendar', isDefaultCalendar: true })
  }
  return [...calendars.values()]
}

export async function fetchSelectedMicrosoftCalendarEvents(accessToken: string, startIso: string, endIso: string, ids?: string[]): Promise<TeamsMeeting[]> {
  if (ids === undefined) return fetchMicrosoftCalendarView(accessToken, startIso, endIso)
  const events = new Map<string, TeamsMeeting>()
  for (const id of [...new Set(ids)]) {
    const meetings = await fetchMicrosoftCalendarView(accessToken, startIso, endIso, id)
    for (const meeting of meetings) events.set(meeting.id, meeting)
  }
  return [...events.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
