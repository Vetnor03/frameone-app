const MS_PER_MINUTE = 60 * 1000

function floorDateToMinute(date: Date) {
  return Math.floor(date.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE
}

function isTeamsMeetingVisibleAt(startsAt: string | null | undefined, now = new Date()) {
  if (!startsAt) return false
  const startsAtDate = new Date(startsAt)
  const startsAtTime = startsAtDate.getTime()
  if (!Number.isFinite(startsAtTime)) return false

  return startsAtTime >= floorDateToMinute(now)
}

export type ReminderRepeatKey =
  | 'none'
  | 'daily'
  | 'weekly'
  | '2weeks'
  | '4weeks'
  | 'monthly'
  | 'halfyear'
  | 'yearly'
  | '2years'
  | 'custom'

export type DeviceReminderSource = 'spond' | 'teams' | 'remind'

export type DeviceReminderItem = {
  reminder_id: string
  title: string
  occurrence_date: string
  display_date: string
  days_until: number
  is_overdue: boolean
  repeat: ReminderRepeatKey
  due_time: string | null
  display_time: string | null
  source?: DeviceReminderSource
  external_id?: string
}

export type IntegrationItemRow = {
  id: string
  user_id: string
  provider: string
  external_id: string
  title: string | null
  body: string | null
  starts_at: string | null
  due_at: string | null
  priority: number | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)

  return { year, month, day }
}

function getClockPartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)

  return { hour, minute }
}

function parseYmdToLocalDate(ymd: string) {
  const [y, m, d] = String(ymd || '').split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}

function addDaysLocal(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function formatDisplayDate(occurrenceYmd: string, todayYmd: string) {
  if (occurrenceYmd === todayYmd) return 'Today'

  const today = parseYmdToLocalDate(todayYmd)
  const occurrence = parseYmdToLocalDate(occurrenceYmd)
  if (!today || !occurrence) return occurrenceYmd

  const tomorrow = addDaysLocal(today, 1)
  const tomorrowYmd = `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`
  if (tomorrowYmd === occurrenceYmd) return 'Tomorrow'

  return `${pad2(occurrence.getDate())}.${pad2(occurrence.getMonth() + 1)}.${occurrence.getFullYear()}`
}

function diffDaysFromYmd(fromYmd: string, toYmd: string) {
  const from = parseYmdToLocalDate(fromYmd)
  const to = parseYmdToLocalDate(toYmd)
  if (!from || !to) return 0

  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())

  return Math.round((toUtc - fromUtc) / 86400000)
}

export function isoToYmdInTimeZone(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = getDatePartsInTimeZone(date, timeZone)
  if (!Number.isFinite(parts.year) || !Number.isFinite(parts.month) || !Number.isFinite(parts.day)) return null
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

export function isoToHmInTimeZone(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = getClockPartsInTimeZone(date, timeZone)
  if (!Number.isFinite(parts.hour) || !Number.isFinite(parts.minute)) return null
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`
}

export function buildSpondReminderItems(
  rows: IntegrationItemRow[],
  todayYmd: string,
  horizonEndYmd: string,
  timeZone: string,
  includeOverdue: boolean
): DeviceReminderItem[] {
  return rows.flatMap((row) => {
    const title = String(row.title || '').trim()
    const externalId = String(row.external_id || '').trim()
    if (!title || !externalId) return []

    const timestamp = row.starts_at || row.due_at
    const occurrenceDate = timestamp ? isoToYmdInTimeZone(timestamp, timeZone) : todayYmd
    if (!occurrenceDate) return []
    if (occurrenceDate > horizonEndYmd) return []

    const daysUntil = diffDaysFromYmd(todayYmd, occurrenceDate)
    if (!includeOverdue && daysUntil < 0) return []

    const displayTime = timestamp ? isoToHmInTimeZone(timestamp, timeZone) : null

    return [{
      reminder_id: `spond:${externalId}`,
      title,
      occurrence_date: occurrenceDate,
      display_date: timestamp ? formatDisplayDate(occurrenceDate, todayYmd) : 'Spond',
      days_until: daysUntil,
      is_overdue: daysUntil < 0,
      repeat: 'none' as ReminderRepeatKey,
      due_time: displayTime,
      display_time: displayTime,
      source: 'spond' as const,
      external_id: externalId,
    }]
  })
}

export function buildTeamsMeetingItems(
  rows: IntegrationItemRow[],
  todayYmd: string,
  horizonEndYmd: string,
  timeZone: string,
  now = new Date()
): DeviceReminderItem[] {
  return rows.flatMap((row) => {
    const title = String(row.title || '').trim()
    const externalId = String(row.external_id || '').trim()
    const startsAt = row.starts_at
    if (!title || !externalId || !startsAt) return []
    if (!isTeamsMeetingVisibleAt(startsAt, now)) return []

    const occurrenceDate = isoToYmdInTimeZone(startsAt, timeZone)
    if (!occurrenceDate) return []
    if (occurrenceDate > horizonEndYmd) return []

    const displayTime = isoToHmInTimeZone(startsAt, timeZone)
    const daysUntil = diffDaysFromYmd(todayYmd, occurrenceDate)
    return [{
      reminder_id: `teams:${externalId}`,
      title,
      occurrence_date: occurrenceDate,
      display_date: formatDisplayDate(occurrenceDate, todayYmd),
      days_until: daysUntil,
      is_overdue: false,
      repeat: 'none' as ReminderRepeatKey,
      due_time: displayTime,
      display_time: displayTime,
      source: 'teams' as const,
      external_id: externalId,
    }]
  })
}

function sortTimeValue(value: string | null) {
  return value || '99:99'
}

export function reminderSortTimestamp(item: Pick<DeviceReminderItem, 'occurrence_date' | 'display_time' | 'due_time'>) {
  return `${item.occurrence_date} ${sortTimeValue(item.display_time || item.due_time)}`
}

export function compareReminderItems(a: DeviceReminderItem, b: DeviceReminderItem) {
  if (a.days_until !== b.days_until) return a.days_until - b.days_until
  if (a.occurrence_date < b.occurrence_date) return -1
  if (a.occurrence_date > b.occurrence_date) return 1

  const at = sortTimeValue(a.display_time || a.due_time)
  const bt = sortTimeValue(b.display_time || b.due_time)
  if (at < bt) return -1
  if (at > bt) return 1

  const sourceRank = (source: DeviceReminderItem['source']) => source === 'teams' ? 0 : source === 'spond' ? 1 : 2
  const as = sourceRank(a.source)
  const bs = sourceRank(b.source)
  if (as !== bs) return as - bs

  return a.title.localeCompare(b.title)
}
