// Todoist unified API v1. The integration requests data:read only.
export const TODOIST_SCOPE = 'data:read'
const API = 'https://api.todoist.com/api/v1'
const TOKEN_URL = 'https://api.todoist.com/oauth/access_token'

export type TodoistCredentials = {
  access_token: string
  refresh_token?: string
  expires_at: string
  scope?: string
  time_zone?: string
}
export type TodoistTask = {
  id?: string
  content?: string
  description?: string
  checked?: boolean
  is_deleted?: boolean
  priority?: number
  due?: { date?: string; datetime?: string; is_recurring?: boolean; timezone?: string } | null
}
type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}
export function todoistSetupError() {
  const missing = ['TODOIST_CLIENT_ID', 'TODOIST_CLIENT_SECRET', 'TODOIST_REDIRECT_URI']
    .filter(key => !process.env[key])
  return missing.length ? { code: 'todoist_not_configured', message: 'Todoist is not configured on the RE:MIND server yet.', missing } : null
}
function env(name: string) {
  const value = process.env[name]
  if (!value) throw new Error('Missing ' + name)
  return value
}
export function todoistRedirectUri() {
  const uri = env('TODOIST_REDIRECT_URI')
  if (!uri.startsWith('https://') && !uri.startsWith('http://localhost:')) throw new Error('Todoist redirect must use HTTPS')
  return uri
}
export function todoistAuthUrl(state: string) {
  if (!state) throw new Error('Missing Todoist OAuth state')
  const url = new URL('https://app.todoist.com/oauth/authorize')
  url.searchParams.set('client_id', env('TODOIST_CLIENT_ID'))
  url.searchParams.set('redirect_uri', todoistRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', TODOIST_SCOPE)
  url.searchParams.set('state', state)
  return url.toString()
}
async function tokenRequest(params: URLSearchParams, previous?: TodoistCredentials): Promise<TodoistCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  const json = await response.json().catch(() => ({})) as TokenResponse
  if (!response.ok || !json.access_token) throw new Error('Todoist authorization failed (' + response.status + ')')
  const seconds = Number(json.expires_in ?? 3600)
  if (!Number.isFinite(seconds) || seconds < 1) throw new Error('Invalid Todoist token expiry')
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || previous?.refresh_token,
    expires_at: new Date(Date.now() + Math.max(1, seconds - 60) * 1000).toISOString(),
    scope: json.scope || previous?.scope,
    time_zone: previous?.time_zone,
  }
}
export function exchangeTodoistCode(code: string) {
  return tokenRequest(new URLSearchParams({
    client_id: env('TODOIST_CLIENT_ID'),
    client_secret: env('TODOIST_CLIENT_SECRET'),
    code,
    redirect_uri: todoistRedirectUri(),
  }))
}
export function refreshTodoistToken(credentials: TodoistCredentials) {
  if (!credentials.refresh_token) throw new Error('Todoist needs reconnection')
  return tokenRequest(new URLSearchParams({
    client_id: env('TODOIST_CLIENT_ID'),
    client_secret: env('TODOIST_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: credentials.refresh_token,
  }), credentials)
}
export class TodoistApiError extends Error {
  readonly status: number
  constructor(status: number) {
    super('Todoist API request failed (' + status + ')')
    this.status = status
  }
}
async function todoistGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(API + path, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new TodoistApiError(response.status)
  return response.json() as Promise<T>
}
export async function fetchTodoistTasks(token: string): Promise<TodoistTask[]> {
  const byId = new Map<string, TodoistTask>()
  let cursor: string | null = null
  for (let page = 0; page < 15; page++) {
    const url = new URL(API + '/tasks')
    url.searchParams.set('limit', '200')
    if (cursor) url.searchParams.set('cursor', cursor)
    const data: { results?: TodoistTask[]; next_cursor?: string | null } = await todoistGet('/tasks' + url.search, token)
    if (!Array.isArray(data.results)) throw new Error('Unexpected Todoist tasks response')
    for (const task of data.results) {
      if (typeof task?.id === 'string' && task.id) byId.set(task.id, task)
    }
    cursor = data.next_cursor || null
    if (!cursor) return [...byId.values()]
  }
  throw new Error('Todoist has too many tasks to sync safely')
}
export async function fetchTodoistProfile(token: string): Promise<{id?: string; full_name?: string; email?: string; tz_info?: {timezone?: string}}> {
  return todoistGet('/user', token)
}
