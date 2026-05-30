type JsonRecord = Record<string, unknown>

export type SpondCredentials = {
  username: string
  password: string
}

export type SpondMappedItem = {
  provider: 'spond'
  external_id: string
  title: string
  body: string | null
  starts_at: string | null
  due_at: string | null
  priority: number
  raw: JsonRecord
}

export type SpondFetchResult = {
  profile: JsonRecord | null
  items: SpondMappedItem[]
}

export class SpondError extends Error {
  status: number
  code: 'invalid_credentials' | 'rate_limited' | 'expired' | 'upstream' | 'unknown'

  constructor(message: string, status: number, code: SpondError['code'] = 'unknown') {
    super(message)
    this.name = 'SpondError'
    this.status = status
    this.code = code
  }
}

const API_BASE = 'https://api.spond.com/core/v1'
const MAX_EVENTS = 100
const MAX_POSTS = 50
const MAX_CHATS = 50

function cleanString(value: unknown, max = 240) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function findText(row: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = cleanString(row[key], 500)
    if (value) return value
  }
  return ''
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter(Boolean) as JsonRecord[] : []
}

function findTimestamp(row: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) {
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const d = new Date(value > 1_000_000_000_000 ? value : value * 1000)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}

async function parseJsonResponse(resp: Response) {
  const text = await resp.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { message: text }
  }
}

function toSpondError(resp: Response, data: unknown) {
  if (resp.status === 401 || resp.status === 403) return new SpondError('Spond login failed. Check the username and password.', resp.status, 'invalid_credentials')
  if (resp.status === 429) return new SpondError('Spond is rate limiting requests. Try again later.', resp.status, 'rate_limited')
  const message = cleanString(asRecord(data)?.message, 180) || `Spond request failed with status ${resp.status}`
  return new SpondError(message, resp.status, 'upstream')
}

export async function spondLogin(credentials: SpondCredentials) {
  const resp = await fetch(`${API_BASE}/auth2/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: credentials.username, password: credentials.password }),
    cache: 'no-store',
  })
  const data = await parseJsonResponse(resp)
  if (!resp.ok) throw toSpondError(resp, data)

  const access = asRecord(data)?.accessToken
  const token = asRecord(access)?.token
  if (typeof token !== 'string' || !token) throw new SpondError('Spond login did not return an access token.', resp.status, 'invalid_credentials')
  return token
}

async function spondGet(path: string, token: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}${path}`)
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value)
  const resp = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    cache: 'no-store',
  })
  const data = await parseJsonResponse(resp)
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new SpondError('Spond session expired. Reconnect Spond.', resp.status, 'expired')
    throw toSpondError(resp, data)
  }
  return data
}

async function spondPost(path: string, token: string) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    cache: 'no-store',
  })
  const data = await parseJsonResponse(resp)
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new SpondError('Spond session expired. Reconnect Spond.', resp.status, 'expired')
    throw toSpondError(resp, data)
  }
  return data
}

function mapEvent(row: JsonRecord): SpondMappedItem | null {
  const id = cleanString(row.id || row.uid, 120)
  const title = findText(row, ['heading', 'subject', 'title', 'name'])
  if (!id || !title) return null
  const start = findTimestamp(row, ['meetupTimestamp', 'startTimestamp', 'startTime', 'startsAt'])
  const end = findTimestamp(row, ['endTimestamp', 'dueTimestamp', 'endTime', 'endsAt'])
  const body = findText(row, ['description', 'body', 'message']) || null
  return { provider: 'spond', external_id: `event:${id}`, title, body, starts_at: start, due_at: end || start, priority: 0, raw: { type: 'event', ...row } }
}

function mapPost(row: JsonRecord): SpondMappedItem | null {
  const id = cleanString(row.id || row.uid, 120)
  const title = findText(row, ['heading', 'subject', 'title', 'name', 'message', 'body', 'text'])
  if (!id || !title) return null
  const created = findTimestamp(row, ['createdTime', 'createdTimestamp', 'createdAt', 'timestamp'])
  const body = findText(row, ['message', 'body', 'text', 'description']) || null
  return { provider: 'spond', external_id: `post:${id}`, title, body, starts_at: created, due_at: created, priority: 10, raw: { type: 'post', ...row } }
}

function mapChat(row: JsonRecord): SpondMappedItem | null {
  const id = cleanString(row.id || row.chatId || row.uid, 120)
  const latest = asRecord(row.latestMessage) || asRecord(row.lastMessage) || row
  const title = findText(latest, ['subject', 'title', 'name', 'text', 'message', 'body']) || findText(row, ['name', 'title'])
  if (!id || !title) return null
  const timestamp = findTimestamp(latest, ['createdTime', 'createdTimestamp', 'createdAt', 'timestamp', 'sentAt']) || findTimestamp(row, ['updatedTime', 'updatedAt'])
  const body = findText(latest, ['text', 'message', 'body']) || null
  return { provider: 'spond', external_id: `chat:${id}`, title, body, starts_at: timestamp, due_at: timestamp, priority: 20, raw: { type: 'chat', ...row } }
}

function dedupeItems(items: Array<SpondMappedItem | null>) {
  const out = new Map<string, SpondMappedItem>()
  for (const item of items) {
    if (!item) continue
    const existing = out.get(item.external_id)
    if (!existing || item.priority < existing.priority) out.set(item.external_id, item)
  }
  return [...out.values()]
}

export async function fetchSpondItems(credentials: SpondCredentials): Promise<SpondFetchResult> {
  const token = await spondLogin(credentials)
  const now = new Date()
  const min = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const max = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString()

  const [profileResult, eventsResult, postsResult, chatLoginResult] = await Promise.allSettled([
    spondGet('/profile', token),
    spondGet('/sponds/', token, { max: String(MAX_EVENTS), scheduled: 'true', minEndTimestamp: min, maxStartTimestamp: max }),
    spondGet('/posts/', token, { type: 'PLAIN', max: String(MAX_POSTS), includeComments: 'false' }),
    spondPost('/chat', token),
  ])

  const requiredFailure = [profileResult, eventsResult].find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined
  if (requiredFailure) throw requiredFailure.reason

  let chats: unknown = []
  if (chatLoginResult.status === 'fulfilled') {
    const chat = asRecord(chatLoginResult.value)
    const chatUrl = cleanString(chat?.url, 500)
    const auth = cleanString(chat?.auth, 500)
    if (chatUrl && auth) {
      try {
        const url = new URL(`${chatUrl}/chats/`)
        url.searchParams.set('max', String(MAX_CHATS))
        const resp = await fetch(url, { headers: { auth }, cache: 'no-store' })
        chats = resp.ok ? await parseJsonResponse(resp) : []
      } catch {
        chats = []
      }
    }
  }

  const items = dedupeItems([
    ...asArray(eventsResult.status === 'fulfilled' ? eventsResult.value : []).map(mapEvent),
    ...asArray(postsResult.status === 'fulfilled' ? postsResult.value : []).map(mapPost),
    ...asArray(chats).map(mapChat),
  ])

  return {
    profile: profileResult.status === 'fulfilled' ? asRecord(profileResult.value) : null,
    items,
  }
}
