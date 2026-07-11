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

export type DeviceReminderSource = 'spond' | 'teams' | 'waste' | 'local_events' | 'remind'

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
  raw?: Record<string, unknown>
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
  raw?: Record<string, unknown> | null
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

export function isSpondEventExternalId(externalId: string | null | undefined) {
  return String(externalId || '').trim().startsWith('event:')
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
    if (!title || !externalId || !isSpondEventExternalId(externalId)) return []

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

export function buildWasteCollectionItems(
  rows: IntegrationItemRow[],
  todayYmd: string,
  horizonEndYmd: string,
  timeZone: string,
  includeOverdue: boolean
): DeviceReminderItem[] {
  const seen = new Set<string>()
  return rows.flatMap((row) => {
    const title = String(row.title || '').trim()
    const externalId = String(row.external_id || '').trim()
    if (!title || !externalId) return []

    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {}
    if (raw.source !== 'waste' || raw.type !== 'waste_collection') return []

    const dateFromRaw = typeof raw.date === 'string' ? raw.date.slice(0, 10) : ''
    const occurrenceDate = /^\d{4}-\d{2}-\d{2}$/.test(dateFromRaw)
      ? dateFromRaw
      : row.starts_at ? isoToYmdInTimeZone(row.starts_at, timeZone) : null
    if (!occurrenceDate) return []
    if (occurrenceDate > horizonEndYmd) return []

    const daysUntil = diffDaysFromYmd(todayYmd, occurrenceDate)
    if (!includeOverdue && daysUntil < 0) return []

    const duplicateKey = `${occurrenceDate}__${String(raw.waste_fraction || title).toLowerCase()}`
    if (seen.has(duplicateKey)) return []
    seen.add(duplicateKey)

    return [{
      reminder_id: `waste:${externalId}`,
      title,
      occurrence_date: occurrenceDate,
      display_date: formatDisplayDate(occurrenceDate, todayYmd),
      days_until: daysUntil,
      is_overdue: daysUntil < 0,
      repeat: 'none' as ReminderRepeatKey,
      due_time: null,
      display_time: null,
      source: 'waste' as const,
      external_id: externalId,
    }]
  })
}

export function buildLocalEventItems(
  rows: IntegrationItemRow[],
  todayYmd: string,
  horizonEndYmd: string,
  timeZone: string
): DeviceReminderItem[] {
  return rows.flatMap((row) => {
    const title = String(row.title || '').trim()
    const externalId = String(row.external_id || '').trim()
    const startsAt = row.starts_at
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {}
    if (!title || !externalId || !startsAt || raw.source !== 'local_events') return []

    const occurrenceDate = isoToYmdInTimeZone(startsAt, timeZone)
    if (!occurrenceDate || occurrenceDate > horizonEndYmd) return []
    const daysUntil = diffDaysFromYmd(todayYmd, occurrenceDate)
    if (daysUntil < 0) return []
    const displayTime = isoToHmInTimeZone(startsAt, timeZone)

    return [{
      reminder_id: `local_events:${externalId}`,
      title: cleanLocalEventDisplayTitle(title, occurrenceDate),
      occurrence_date: occurrenceDate,
      display_date: formatDisplayDate(occurrenceDate, todayYmd),
      days_until: daysUntil,
      is_overdue: false,
      repeat: 'none' as ReminderRepeatKey,
      due_time: displayTime,
      display_time: displayTime,
      source: 'local_events' as const,
      external_id: externalId,
      raw,
    }]
  })
}

function sortTimeValue(value: string | null) {
  return value || '99:99'
}

function cleanLocalEventDisplayTitle(title: string, occurrenceDate: string) {
  const [, monthValue, dayValue] = occurrenceDate.split('-').map(Number)
  if (!Number.isFinite(monthValue) || !Number.isFinite(dayValue)) return title
  const monthForName: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, februar: 2, feb: 2,
    march: 3, mars: 3, mar: 3,
    april: 4, apr: 4,
    may: 5, mai: 5,
    june: 6, juni: 6, jun: 6,
    july: 7, juli: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9,
    october: 10, oktober: 10, oct: 10, okt: 10,
    november: 11, nov: 11,
    december: 12, desember: 12, dec: 12, des: 12,
  }
  return title.replace(/(?:,\s*|\s+[–-]\s+|\s+)(\d{1,2})\.?\s+([A-Za-zæøåÆØÅ]+)\.?\s*$/i, (match, day, monthName) => {
    const month = monthForName[String(monthName).toLowerCase()]
    return Number(day) === dayValue && month === monthValue ? '' : match
  }).replace(/\s+/g, ' ').trim()
}

export function reminderSortTimestamp(item: Pick<DeviceReminderItem, 'occurrence_date' | 'display_time' | 'due_time'>) {
  return `${item.occurrence_date} ${sortTimeValue(item.display_time || item.due_time)}`
}

export function selectReminderDisplayGroups(items: DeviceReminderItem[], maxItems: number) {
  if (!Number.isFinite(maxItems) || maxItems <= 0) return []

  const cap = Math.floor(maxItems)
  const selectedGroupKeys: string[] = []
  const selectedItems: DeviceReminderItem[] = []

  for (const item of items) {
    const groupKey = item.occurrence_date || item.display_date
    if (!groupKey) continue

    if (!selectedGroupKeys.includes(groupKey)) {
      if (selectedGroupKeys.length >= 2) break
      selectedGroupKeys.push(groupKey)
    }

    if (selectedGroupKeys.includes(groupKey)) {
      selectedItems.push(item)
      if (selectedItems.length >= cap) break
    }
  }

  return selectedItems
}

export function selectNextLocalEventItem(items: DeviceReminderItem[], now = new Date()) {
  const nowYmd = isoToYmdInTimeZone(now.toISOString(), 'Europe/Oslo')
  const nowHm = isoToHmInTimeZone(now.toISOString(), 'Europe/Oslo')
  const nowSort = `${nowYmd} ${nowHm}`
  const importedLocalEvents = items.length
  const removedAlreadyStarted = items.filter((event) => reminderSortTimestamp(event) <= nowSort && event.raw?.all_day !== true).length
  const removedExpiredAllDay = items.filter((event) => reminderSortTimestamp(event) <= nowSort && event.raw?.all_day === true).length
  const removedSkipped = items.filter((event) => (event as DeviceReminderItem & { skippedOnFrame?: boolean }).skippedOnFrame).length
  const eligible = items
    .filter((event) => !(event as DeviceReminderItem & { skippedOnFrame?: boolean }).skippedOnFrame)
    .filter((event) => reminderSortTimestamp(event) > nowSort)
  const rank = (event: DeviceReminderItem) => {
    const classification = String(event.raw?.event_kind || '')
    if (classification === 'one_off') return { priority: 1, reason: 'timely one-off event' }
    if (classification === 'separate_session') return { priority: 3, reason: 'meaningful separate session' }
    if (classification === 'continuous') return event.days_until <= 1 ? { priority: 4, reason: 'newly opened continuous event' } : { priority: 5, reason: 'continuous event ending soon' }
    return { priority: 2, reason: 'festival or limited event' }
  }
  const ranked = eligible.map((event) => ({ event, ...rank(event) })).sort((a, b) => a.priority - b.priority || reminderSortTimestamp(a.event).localeCompare(reminderSortTimestamp(b.event)))
  const selected = ranked[0] ?? null
  console.info('frame/mirror local event selector diagnostics', {
    importedLocalEvents,
    upcomingEligibleEvents: eligible.length,
    removedAlreadyStarted,
    removedExpiredAllDay,
    removedSkipped,
    removedHiddenSeries: 0,
    removedByContinuousCooldown: 0,
    rankedCandidates: ranked.slice(0, 10).map(({ event, priority, reason }) => ({ title: event.title, classification: event.raw?.event_kind || null, startAt: `${event.occurrence_date} ${event.display_time || 'all-day'}`, priority, reason })),
    selectedEvent: selected ? { title: selected.event.title, startAt: `${selected.event.occurrence_date} ${selected.event.display_time || 'all-day'}`, classification: selected.event.raw?.event_kind || null, reason: selected.reason } : null,
  })
  return selected?.event ?? null
}

export function limitLocalEventsToNext(items: DeviceReminderItem[], now = new Date()) {
  const nextLocalEvent = selectNextLocalEventItem(items.filter((item) => item.source === 'local_events'), now)
  return items.filter((item) => item.source !== 'local_events' || item === nextLocalEvent)
}

export function compareReminderItems(a: DeviceReminderItem, b: DeviceReminderItem) {
  if (a.days_until !== b.days_until) return a.days_until - b.days_until
  if (a.occurrence_date < b.occurrence_date) return -1
  if (a.occurrence_date > b.occurrence_date) return 1

  const at = sortTimeValue(a.display_time || a.due_time)
  const bt = sortTimeValue(b.display_time || b.due_time)
  if (at < bt) return -1
  if (at > bt) return 1

  const sourceRank = (source: DeviceReminderItem['source']) => source === 'teams' ? 0 : source === 'spond' ? 1 : source === 'waste' ? 2 : source === 'local_events' ? 3 : 4
  const as = sourceRank(a.source)
  const bs = sourceRank(b.source)
  if (as !== bs) return as - bs

  return a.title.localeCompare(b.title)
}
