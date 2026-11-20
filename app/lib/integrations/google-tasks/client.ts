import { normalizeGoogleTask, type GoogleTaskLike } from './normalize.mjs'

export type GoogleTasksTokenSet = {
  access_token: string
  refresh_token?: string
  expires_at: string
  scope?: string
  token_type?: string
}
export type GoogleTasksCredentials = GoogleTasksTokenSet
export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks.readonly'
const GOOGLE_TASKS_API = 'https://tasks.googleapis.com/tasks/v1'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export class GoogleTasksApiError extends Error {
  constructor(public readonly status: number) {
    super('Google Tasks API failed (' + status + ')')
  }
}

function clientId() { return process.env.GOOGLE_TASKS_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID || '' }
function clientSecret() { return process.env.GOOGLE_TASKS_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '' }
function redirectUri() { return process.env.GOOGLE_TASKS_REDIRECT_URI || '' }

export function googleTasksSetupError() {
  if (clientId() && clientSecret() && redirectUri()) return null
  return {
    code: 'google_tasks_not_configured',
    message: 'Google Tasks is not configured yet. An administrator must enable its API and OAuth callback.',
  }
}
function assertConfigured() {
  if (googleTasksSetupError()) throw new Error('Google Tasks OAuth is not configured')
}
export function googleTasksAuthUrl(state: string, codeChallenge: string) {
  assertConfigured()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_TASKS_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent select_account')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}
type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}
async function requestTokens(body: URLSearchParams, priorRefresh?: string): Promise<GoogleTasksTokenSet> {
  assertConfigured()
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  const data = await response.json().catch(() => ({})) as GoogleTokenResponse
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google Tasks authorization failed')
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || priorRefresh,
    expires_at: new Date(Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000).toISOString(),
    scope: data.scope,
    token_type: data.token_type,
  }
}
export function exchangeGoogleTasksCode(code: string, verifier: string) {
  return requestTokens(new URLSearchParams({
    client_id: clientId(), client_secret: clientSecret(),
    redirect_uri: redirectUri(), grant_type: 'authorization_code',
    code, code_verifier: verifier,
  }))
}
export function refreshGoogleTasksToken(credentials: GoogleTasksCredentials) {
  if (!credentials.refresh_token) throw new Error('Reconnect Google Tasks to restore access')
  return requestTokens(new URLSearchParams({
    client_id: clientId(), client_secret: clientSecret(),
    grant_type: 'refresh_token', refresh_token: credentials.refresh_token,
  }), credentials.refresh_token)
}

async function apiGet<T>(url: URL, accessToken: string): Promise<T> {
  // Pagination only supplies opaque tokens; never follow provider-controlled URLs.
  if (url.protocol !== 'https:' || url.hostname !== 'tasks.googleapis.com' || !url.pathname.startsWith('/tasks/v1/')) {
    throw new Error('Unexpected Google Tasks API URL')
  }
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new GoogleTasksApiError(response.status)
  return await response.json() as T
}
type GoogleTaskList = { id?: string; title?: string }
export async function fetchGoogleTaskListsAndTasks(accessToken: string) {
  const lists: GoogleTaskList[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 5; page++) {
    const url = new URL(GOOGLE_TASKS_API + '/users/@me/lists')
    url.searchParams.set('maxResults', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await apiGet<{ items?: GoogleTaskList[]; nextPageToken?: string }>(url, accessToken)
    if (response.items && !Array.isArray(response.items)) throw new Error('Invalid Google Tasks lists response')
    lists.push(...(response.items || []))
    pageToken = response.nextPageToken
    if (!pageToken) break
  }
  if (pageToken || lists.length > 150) throw new Error('Google Tasks list limit exceeded; keeping cached tasks')
  const rows: ReturnType<typeof normalizeGoogleTask>[] = []
  for (const list of lists) {
    if (!list.id) continue
    let nextPage: string | undefined
    for (let page = 0; page < 35; page++) {
      const url = new URL(GOOGLE_TASKS_API + '/lists/' + encodeURIComponent(list.id) + '/tasks')
      url.searchParams.set('maxResults', '100')
      url.searchParams.set('showCompleted', 'false')
      url.searchParams.set('showDeleted', 'false')
      url.searchParams.set('showHidden', 'false')
      if (nextPage) url.searchParams.set('pageToken', nextPage)
      const response = await apiGet<{items?: GoogleTaskLike[]; nextPageToken?: string}>(url, accessToken)
      if (response.items && !Array.isArray(response.items)) throw new Error('Invalid Google Tasks task response')
      for (const task of response.items || []) rows.push(normalizeGoogleTask(task, list.id))
      if (rows.length > 3000) throw new Error('Google Tasks item limit exceeded; keeping cached tasks')
      nextPage = response.nextPageToken
      if (!nextPage) break
    }
    if (nextPage) throw new Error('Google Tasks pagination limit exceeded; keeping cached tasks')
  }
  return rows.filter((row): row is NonNullable<typeof row> => row !== null)
}
