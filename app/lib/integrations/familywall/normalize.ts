type Row = Record<string, unknown>
const ymd = /^\d{4}-\d{2}-\d{2}$/
const isoWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i
function obj(value: unknown): Row | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null }
function str(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && !!value.trim())?.trim() || ''
}
function validDate(value: string) {
  if (!ymd.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function timestamp(value: string) {
  if (!isoWithOffset.test(value) || !validDate(value.slice(0, 10))) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
function eventRows(value: unknown, depth = 0): unknown[] {
  if (depth > 3) throw new Error('Unsupported FamilyWall calendar format')
  if (Array.isArray(value)) return value
  const row = obj(value)
  if (!row || row.has_more === true || row.nextCursor || row.next_cursor) throw new Error('Incomplete FamilyWall calendar response')
  for (const key of ['events', 'items', 'data', 'result', 'results', 'entries']) {
    if (row[key] !== undefined && row[key] !== null) return eventRows(row[key], depth + 1)
  }
  throw new Error('Unsupported FamilyWall calendar format')
}
export function normalizeFamilyWallCalendar(value: unknown) {
  const rows = eventRows(value)
  if (rows.length > 2000) throw new Error('FamilyWall calendar exceeds safe limit')
  const normalized = new Map<string, {
    external_id: string; title: string; body: null; starts_at: string; due_at: string; priority: number;
    raw: { source: 'familywall'; type: 'event'; all_day: boolean; date: string }
  }>()
  for (const value of rows) {
    const row = obj(value)
    if (!row) throw new Error('Invalid FamilyWall event')
    const id = str(row.id, row.event_id, row.eventId, row.occurrence_id, row.external_id)
    const title = str(row.title, row.name, row.summary, row.label)
    const startObj = obj(row.start)
    const endObj = obj(row.end)
    const start = str(row.start, startObj?.dateTime, startObj?.date, row.starts_at, row.startsAt, row.start_datetime, row.startDateTime, row.start_date_time, row.start_time, row.start_date, row.startDate, row.date)
    const end = str(row.end, endObj?.dateTime, endObj?.date, row.ends_at, row.endsAt, row.end_datetime, row.endDateTime, row.end_date_time, row.end_time, row.end_date, row.endDate)
    const allDay = row.all_day === true || row.allDay === true || row.is_all_day === true || row.isAllDay === true || validDate(start)
    const date = start.slice(0, 10)
    if (!id || id.length > 300 || !title || !validDate(date)) throw new Error('Unsupported FamilyWall event fields')
    const startsAt = allDay ? date + 'T00:00:00.000Z' : timestamp(start)
    const dueAt = allDay ? date + 'T23:59:59.000Z' : (timestamp(end) || startsAt)
    if (!startsAt || !dueAt) throw new Error('FamilyWall event requires an explicit time zone')
    const externalId = 'event:' + id + ':' + (allDay ? date : startsAt)
    normalized.set(externalId, { external_id: externalId, title: title.slice(0, 120), body: null, starts_at: startsAt, due_at: dueAt, priority: 0, raw: { source: 'familywall', type: 'event', all_day: allDay, date } })
  }
  return [...normalized.values()]
}
