// Pure projection of an active Todoist task into the existing reminder cache.
// Todoist has two kinds of timed dues: floating (local wall clock, no UTC offset)
// and fixed (an RFC3339 timestamp with a UTC offset). Never interpret a floating
// due as UTC just because the server happens to run in UTC.

const FLOATING_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$/
const EXPLICIT_OFFSET = /(Z|[+-]\d{2}:\d{2})$/i

function floatingDueToUtc(value, timeZone) {
  if (!timeZone) throw new Error('Todoist floating due time needs the user timezone')
  const match = FLOATING_DATE_TIME.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute, second, fraction] = match.slice(1)
  const wallClock = Date.UTC(+year, +month - 1, +day, +hour, +minute, +(second || 0), +(fraction || '').padEnd(3, '0').slice(0, 3))
  if (!Number.isFinite(wallClock)) return null

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  const wallClockAt = ms => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part => [part.type, part.value]))
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second, ms % 1000)
  }
  let timestamp = wallClock
  for (let i = 0; i < 4; i++) {
    const difference = wallClock - wallClockAt(timestamp)
    if (difference === 0) break
    timestamp += difference
  }
  // A DST spring-forward gap has no corresponding actual time.
  if (wallClockAt(timestamp) !== wallClock) return null
  return new Date(timestamp)
}

export function normalizeTodoistTask(task, options = {}) {
  const id = typeof task?.id === 'string' ? task.id.trim() : ''
  const title = typeof task?.content === 'string' ? task.content.trim().slice(0, 300) : ''
  if (!id || id.length > 128 || !title || task.checked === true || task.is_deleted === true) return null
  const due = task.due
  const dateValue = typeof due?.date === 'string' ? due.date : ''
  const datetime = typeof due?.datetime === 'string' ? due.datetime : (/T/.test(dateValue) ? dateValue : '')
  const date = dateValue.slice(0, 10) || (datetime ? datetime.slice(0, 10) : '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const allDay = !datetime
  // Todoist's due.date is authoritative for floating clock-time dues.
  // Some API representations can include an additional normalized datetime;
  // it must not override the floating due.date's wall clock semantics.
  const floatingSource = FLOATING_DATE_TIME.test(dateValue) && !due?.timezone
    ? dateValue
    : (!due?.timezone && !EXPLICIT_OFFSET.test(dateValue) && FLOATING_DATE_TIME.test(datetime) ? datetime : '')
  const floating = Boolean(floatingSource)
  const startsAt = allDay
    ? new Date(date + 'T12:00:00Z')
    : floating ? floatingDueToUtc(floatingSource, options.timeZone)
    : new Date(datetime)
  if (!startsAt || Number.isNaN(startsAt.getTime())) return null
  return {
    external_id: id, title, body: null,
    starts_at: startsAt.toISOString(), due_at: startsAt.toISOString(),
    priority: 0,
    raw: {
      source: 'todoist', type: 'task', all_day: allDay,
      date: allDay || floating ? date : null,
      ...(floating ? { floating_time: floatingSource.slice(11, 16) } : {}),
      recurring: due?.is_recurring === true,
    },
  }
}
