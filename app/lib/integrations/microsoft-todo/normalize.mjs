// Pure projection from Microsoft Graph To Do into RE:MIND's existing task cache.
// Graph's dateTimeTimeZone carries a wall-clock time and a named time zone.
// Never assume these times use the Vercel server's time zone.
const WINDOW_ZONES = {
  'W. Europe Standard Time': 'Europe/Oslo',
  'Central Europe Standard Time': 'Europe/Warsaw',
  'Central European Standard Time': 'Europe/Budapest',
  'GMT Standard Time': 'Europe/London',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
}
const YMD = /^\d{4}-\d{2}-\d{2}$/
const WALL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/
function validZone(value, fallback) {
  const candidate = WINDOW_ZONES[value] || value || fallback || 'UTC'
  try { new Intl.DateTimeFormat('en', { timeZone: candidate }); return candidate }
  catch { return fallback || 'UTC' }
}
function dateDetails(value) {
  const match = WALL.exec(String(value?.dateTime || ''))
  if (!match || !YMD.test(match[1])) return null
  const hour = Number(match[2]), minute = Number(match[3])
  if (hour > 23 || minute > 59) return null
  return { date: match[1], time: match[2] + ':' + match[3], second: Number(match[4] || 0), zone: value?.timeZone || '' }
}
function localToUtc(date, time, zone) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const asWall = timestamp => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(timestamp)).map(x => [x.type, x.value]))
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  }
  let timestamp = target
  for (let i = 0; i < 4; i++) {
    const delta = target - asWall(timestamp)
    if (!delta) break
    timestamp += delta
  }
  return asWall(timestamp) === target ? new Date(timestamp).toISOString() : null
}
export function normalizeMicrosoftTodoTask(task, listId, options = {}) {
  const id = typeof task?.id === 'string' ? task.id.trim() : ''
  const title = typeof task?.title === 'string' ? task.title.trim().slice(0, 300) : ''
  if (!id || !title || !listId || task.status === 'completed' || task.isDeleted === true) return null
  const due = dateDetails(task.dueDateTime)
  const reminder = task.isReminderOn === true ? dateDetails(task.reminderDateTime) : null
  const selected = due || reminder
  if (!selected) return null // Undated tasks cannot be placed on a calendar.
  const localDate = selected.date
  // To Do normally stores a due DATE at midnight. A separate explicit
  // reminder time on that same date is more useful than displaying 00:00.
  const timed = (reminder && reminder.date === localDate && reminder.time !== '00:00')
    ? reminder : selected.time !== '00:00' ? selected : null
  const zone = validZone(timed?.zone || selected.zone, options.timeZone)
  const startsAt = timed
    ? localToUtc(localDate, timed.time, zone)
    : new Date(localDate + 'T12:00:00.000Z').toISOString()
  if (!startsAt) return null
  const reminderLabel = reminder ? reminder.date + ' ' + reminder.time : null
  return {
    external_id: listId + ':' + id,
    title, body: null,
    starts_at: startsAt, due_at: startsAt, priority: 0,
    raw: {
      source: 'microsoft-todo', type: 'task',
      all_day: !timed, date: localDate,
      ...(timed ? { floating_time: timed.time } : {}),
      ...(reminderLabel ? { reminder_at: reminderLabel } : {}),
      ...(task.recurrence ? { recurring: true } : {}),
    },
  }
}
