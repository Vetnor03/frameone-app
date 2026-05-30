export type SpondCredentials = {
  username: string
  password: string
}

export type ExternalReminderItemInput = {
  provider: 'spond'
  external_id: string
  title: string
  due_at: string
  source_metadata: Record<string, unknown>
}

type SpondEvent = Record<string, unknown>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

const SPOND_API_BASE = 'https://api.spond.com/core/v1/'
const DEFAULT_MAX_EVENTS = 40
const DEFAULT_LOOKAHEAD_DAYS = 60

function assertEnabled() {
  if (String(process.env.SPOND_PROVIDER_ENABLED ?? 'true').toLowerCase() === 'false') {
    throw new Error('Spond provider is disabled')
  }
}

function toSpondDate(date: Date) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T00:00:00.000Z`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function cleanText(value: unknown, max = 180) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
}

function eventStart(event: SpondEvent) {
  return cleanText(event.startTimestamp ?? event.startTime ?? event.start ?? event.startDateTime ?? event.date, 80)
}

function eventTitle(event: SpondEvent) {
  return cleanText(event.heading ?? event.name ?? event.title ?? event.summary ?? 'Spond event', 160) || 'Spond event'
}

function eventGroupName(event: SpondEvent) {
  const group = asRecord(event.group)
  const ownerGroup = asRecord(event.ownerGroup)
  return cleanText(group.name ?? event.groupName ?? group.heading ?? ownerGroup.name, 120)
}

function eventLocation(event: SpondEvent) {
  const place = event.location ?? event.place ?? event.address
  if (typeof place === 'string') return cleanText(place, 160)
  if (place && typeof place === 'object') {
    const placeRecord = asRecord(place)
    return cleanText(placeRecord.name ?? placeRecord.address ?? placeRecord.location ?? placeRecord.text, 160)
  }
  return ''
}

function eventResponseStatus(event: SpondEvent) {
  const responses = Array.isArray(event.responses) ? event.responses : []
  const current = responses.find((r) => r?.currentUser === true || r?.self === true || r?.me === true)
  const raw = current ?? event.response ?? event.myResponse ?? event.attendanceStatus
  if (!raw) return ''
  if (typeof raw === 'string') return cleanText(raw, 60)
  if (typeof raw === 'object') return cleanText(raw.status ?? raw.answer ?? raw.accepted ?? raw.response, 60)
  return cleanText(raw, 60)
}

export function mapSpondEventsToExternalItems(events: SpondEvent[]): ExternalReminderItemInput[] {
  const nowMs = Date.now()

  return events
    .map((event) => {
      const externalId = cleanText(event.id ?? event.uid, 120)
      const dueAt = eventStart(event)
      const dueMs = Date.parse(dueAt)

      if (!externalId || !dueAt || !Number.isFinite(dueMs) || dueMs < nowMs - 60 * 60 * 1000) return null

      const metadata = {
        group_name: eventGroupName(event) || null,
        location: eventLocation(event) || null,
        response_status: eventResponseStatus(event) || null,
      }

      return {
        provider: 'spond' as const,
        external_id: externalId,
        title: eventTitle(event),
        due_at: new Date(dueMs).toISOString(),
        source_metadata: metadata,
      }
    })
    .filter(Boolean) as ExternalReminderItemInput[]
}

export class SpondProviderClient {
  private token: string | null = null

  constructor(private credentials: SpondCredentials) {}

  async login() {
    assertEnabled()
    const response = await fetch(`${SPOND_API_BASE}login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.credentials.username, password: this.credentials.password }),
      cache: 'no-store',
    })

    const body = await response.json().catch(() => null)
    const token = body?.loginToken
    if (!response.ok || typeof token !== 'string' || !token) {
      throw new Error('Spond login failed')
    }

    this.token = token
  }

  async getUpcomingEvents(options?: { lookaheadDays?: number; maxEvents?: number }) {
    if (!this.token) await this.login()

    const minStart = new Date()
    const maxStart = addDays(minStart, options?.lookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS)
    const params = new URLSearchParams({
      max: String(options?.maxEvents ?? DEFAULT_MAX_EVENTS),
      scheduled: 'false',
      minStartTimestamp: toSpondDate(minStart),
      maxStartTimestamp: toSpondDate(maxStart),
    })

    const response = await fetch(`${SPOND_API_BASE}sponds/?${params.toString()}`, {
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) throw new Error(`Spond events request failed with status ${response.status}`)
    const body = await response.json()
    return Array.isArray(body) ? (body as SpondEvent[]) : []
  }
}
