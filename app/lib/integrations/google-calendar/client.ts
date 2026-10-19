export const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'] as const

export type GoogleTokenSet = {
  access_token: string
  refresh_token?: string
  expires_at: string
  scope?: string
  token_type?: string
}
export type GoogleCredentials = GoogleTokenSet & { time_zone: string }
export type GoogleCalendarEntry = {
  id: string
  summary?: string
  primary?: boolean
  selected?: boolean
  hidden?: boolean
  accessRole?: string
}
export type GoogleEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  location: string | null
  all_day: boolean
  date: string | null
  calendar: string
  calendar_id: string
  source_url: string | null
}

const API_ROOT = 'https://www.googleapis.com/calendar/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export function googleCalendarSetupError() {
  const missing = ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REDIRECT_URI']
    .filter((name) => !process.env[name])
  return missing.length ? {
    code: 'google_calendar_not_configured',
    message: 'Google Calendar is not configured yet. An administrator must configure Google OAuth.',
    missing,
  } : null
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error('Missing ' + name)
  return value
}

export function googleCalendarRedirectUri() {
  return requiredEnv('GOOGLE_CALENDAR_REDIRECT_URI')
}

export function googleCalendarAuthUrl(state: string, codeChallenge: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', requiredEnv('GOOGLE_CALENDAR_CLIENT_ID'))
  url.searchParams.set('redirect_uri', googleCalendarRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent select_account')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
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

function storeTokens(data: TokenResponse, oldRefresh?: string): GoogleTokenSet {
  if (!data.access_token) throw new Error('Google did not return an access token')
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || oldRefresh,
    expires_at: new Date(Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000).toISOString(),
    scope: data.scope,
    token_type: data.token_type,
  }
}

async function requestTokens(body: URLSearchParams, oldRefresh?: string) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({})) as TokenResponse
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google token exchange failed')
  }
  return storeTokens(data, oldRefresh)
}

export function exchangeGoogleCode(code: string, verifier: string) {
  return requestTokens(new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CALENDAR_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_CALENDAR_CLIENT_SECRET'),
    redirect_uri: googleCalendarRedirectUri(),
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
  }))
}

export function refreshGoogleToken(credentials: GoogleCredentials) {
  if (!credentials.refresh_token) throw new Error('Google Calendar requires reconnection')
  return requestTokens(new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CALENDAR_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_CALENDAR_CLIENT_SECRET'),
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  }), credentials.refresh_token)
}

async function googleGet<T>(url: URL, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as { error?: { message?: string } }
  if (!response.ok) throw new Error(data.error?.message || 'Google Calendar API failed: ' + response.status)
  return data as T
}

export async function fetchGoogleCalendars(token: string): Promise<GoogleCalendarEntry[]> {
  const calendars: GoogleCalendarEntry[] = []
  let pageToken: string | null = null
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(API_ROOT + '/users/me/calendarList')
    url.searchParams.set('maxResults', '100')
    url.searchParams.set('minAccessRole', 'reader')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const data: { items?: GoogleCalendarEntry[]; nextPageToken?: string } = await googleGet(url, token)
    calendars.push(...(data.items || []))
    pageToken = data.nextPageToken || null
    if (!pageToken) break
  }
  if (pageToken) throw new Error('Too many Google Calendar pages')
  const selected = calendars.filter(c => c.id && !c.hidden && (c.selected !== false || c.primary))
  if (selected.length > 20) throw new Error('Too many visible Google calendars to sync (maximum 20)')
  return selected
}

type GoogleRawEvent = {
  id?: string
  summary?: string
  status?: string
  visibility?: string
  htmlLink?: string
  location?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
}

export function normalizeGoogleEvent(event: GoogleRawEvent, calendar: GoogleCalendarEntry): GoogleEvent | null {
  if (!event.id || event.status === 'cancelled') return null
  if (event.attendees?.some(a => a.self && a.responseStatus === 'declined')) return null
  const allDay = !!event.start?.date && !event.start?.dateTime
  const date = allDay ? event.start?.date || null : null
  // Use a midday anchor for all-day events; raw.date is authoritative when displayed.
  const startValue = allDay ? (date ? date + 'T12:00:00Z' : '') : event.start?.dateTime || ''
  const start = new Date(startValue)
  if (Number.isNaN(start.getTime())) return null
  const endValue = allDay ? startValue : event.end?.dateTime || startValue
  const end = new Date(endValue)
  return {
    id: calendar.id + ':' + event.id,
    title: event.visibility === 'private' && calendar.accessRole === 'reader' ? 'Busy' : (event.summary?.trim() || 'Busy'),
    starts_at: start.toISOString(),
    ends_at: Number.isNaN(end.getTime()) ? start.toISOString() : end.toISOString(),
    location: event.location?.trim() || null,
    all_day: allDay,
    date,
    calendar: calendar.summary || '',
    calendar_id: calendar.id,
    source_url: typeof event.htmlLink === 'string' && event.htmlLink.startsWith('https://') ? event.htmlLink : null,
  }
}

export async function fetchGoogleEvents(token: string, calendars: GoogleCalendarEntry[], startIso: string, endIso: string): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = []
  for (const calendar of calendars) {
    let pageToken: string | null = null
    for (let page = 0; page < 20; page += 1) {
      const url = new URL(API_ROOT + '/calendars/' + encodeURIComponent(calendar.id) + '/events')
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('timeMin', startIso)
      url.searchParams.set('timeMax', endIso)
      url.searchParams.set('maxResults', '250')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const data: { items?: GoogleRawEvent[]; nextPageToken?: string } = await googleGet(url, token)
      events.push(...(data.items || []).map(e => normalizeGoogleEvent(e, calendar)).filter((e): e is GoogleEvent => e !== null))
      pageToken = data.nextPageToken || null
      if (!pageToken) break
    }
    if (pageToken) throw new Error('Google Calendar result too large to sync safely')
  }
  if (events.length > 5000) throw new Error('Google Calendar contains too many upcoming events')
  return events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
