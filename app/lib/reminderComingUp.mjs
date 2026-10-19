// Short, grounded insights for sparse medium Reminders. All reasoning happens
// server-side using the already-authorized combined Reminders / Connect feed.
// No additional OpenAI request, client-side setting or firmware change.
const MAX_OUTLOOK_CHARS = 78
const MAX_TITLE_CHARS = 40
const weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdaysNo = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']

const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
const dayNumber = value => (typeof value === 'number' && Number.isInteger(value) ? value : null)
const time = value => {
  const raw = text(value).slice(0, 5)
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : ''
}
const norwegian = language => /^(no|nb|nn)(-|$)/i.test(String(language || ''))
const titleKey = title => text(title).toLocaleLowerCase('en-US').replace(/[.,:;!?]+$/, '')
const clockOf = row => row?.is_all_day ? '' : time(row?.display_time)

// This is a hint only when the source title explicitly identifies a deadline.
// We do not infer a due date, preparation obligation or travel time.
const explicitDeadline = row => /(?:^|\W)(?:deadline|due date|due tomorrow|due soon|frist|fristen|forfall|forfallsdato|utløper)(?:$|\W)/i.test(text(row?.title))

function shorten(value, maximum = MAX_TITLE_CHARS) {
  const trimmed = text(value)
  if (trimmed.length <= maximum) return trimmed
  const prefix = trimmed.slice(0, maximum - 3)
  const boundary = prefix.lastIndexOf(' ')
  return (boundary > 16 ? prefix.slice(0, boundary) : prefix).trimEnd() + '...'
}
function cap(value) {
  if (value.length <= MAX_OUTLOOK_CHARS) return value
  const prefix = value.slice(0, MAX_OUTLOOK_CHARS - 3)
  const space = prefix.lastIndexOf(' ')
  return (space > 34 ? prefix.slice(0, space) : prefix).trimEnd().replace(/[.,:;!?]+$/, '') + '...'
}
function weekday(date, no) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const parsed = new Date(date + 'T12:00:00Z')
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return ''
  return (no ? weekdaysNo : weekdaysEn)[parsed.getUTCDay()]
}
function labelForDay(row, no) {
  if (row.days_until === 1) return no ? 'I morgen' : 'Tomorrow'
  const day = weekday(text(row.occurrence_date).slice(0, 10), no)
  return day ? no ? 'På ' + day : 'On ' + day : ''
}
function detail(row, no, maxTitle = MAX_TITLE_CHARS) {
  const title = shorten(row.title, maxTitle)
  const at = clockOf(row)
  return title + (at ? (no ? ' kl. ' : ' at ') + at : '')
}
function upcomingDescription(row, no) {
  const day = labelForDay(row, no)
  const at = clockOf(row)
  const title = shorten(row.title)
  if (!day) return ''
  return cap(day + (at ? (no ? ' kl. ' : ' at ') + at : '') + ': ' + title + '.')
}
function deadlineDescription(row, no) {
  const day = labelForDay(row, no)
  if (!day) return ''
  const title = shorten(row.title)
  // The word "deadline" comes from the actual title, not a speculative rule.
  if (no) return cap((row.days_until === 1 ? 'Frist i morgen' : 'Viktig ' + day.toLowerCase()) + ': ' + title + '.')
  return cap((row.days_until === 1 ? 'Deadline tomorrow' : 'Deadline ' + day.toLowerCase()) + ': ' + title + '.')
}
function earlyDescription(row, no) {
  const at = clockOf(row)
  const title = shorten(row.title, 38)
  return cap(no
    ? 'Tidlig i morgen: ' + title + ' kl. ' + at + '.'
    : 'Early tomorrow: ' + title + ' at ' + at + '.')
}
function busyDescription(dayRows, no, day, early = null) {
  const count = dayRows.length
  if (early && count >= 3) {
    return cap(no
      ? 'Travel dag i morgen: ' + count + ' planer. ' + detail(early, no, 22) + '.'
      : 'Busy tomorrow: ' + count + ' plans. ' + detail(early, no, 22) + '.')
  }
  if (day === 1) return no
    ? 'I morgen har du ' + count + ' avtaler eller gjøremål.'
    : 'Tomorrow is busy, with ' + count + ' things scheduled.'
  const label = labelForDay(dayRows[0], no)
  return cap(no
    ? label + ' blir travel med ' + count + ' planer.'
    : label + ' looks busy, with ' + count + ' things planned.')
}
function uniqueFuture(rows, todayTitles) {
  const seen = new Set()
  return rows.filter(row => {
    const days = dayNumber(row?.days_until)
    const title = titleKey(row?.title)
    if (days == null || days < 1 || days > 7 || !title || todayTitles.has(title)) return false
    // Require a plausible future date to avoid ungrounded weekday claims.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(row.occurrence_date).slice(0, 10))) return false
    const key = String(days) + ':' + title + ':' + clockOf(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a,b) =>
    a.days_until - b.days_until ||
    clockOf(a).localeCompare(clockOf(b)) ||
    text(a.title).localeCompare(text(b.title)))
}

/**
 * Only show when the *whole today list* contains 1–2 reminders; never remove
 * or duplicate a visible reminder just to create an insight.
 *
 * localHour is supplied by the device's configured time zone. During the
 * evening, tomorrow deserves precedence over less urgent later-week events.
 */
export function buildReminderComingUp(items, language = 'en', { localHour = null } = {}) {
  const rows = Array.isArray(items) ? items : []
  const today = rows.filter(row => dayNumber(row?.days_until) === 0 && text(row?.title))
  if (today.length < 1 || today.length > 2) return ''

  const no = norwegian(language)
  const upcoming = uniqueFuture(rows, new Set(today.map(row => titleKey(row.title))))
  if (!upcoming.length) return ''

  const tomorrow = upcoming.filter(row => row.days_until === 1)
  const early = tomorrow.find(row => clockOf(row) && clockOf(row) < '09:00')
  const soonDeadline = upcoming.find(row => row.days_until <= 3 && explicitDeadline(row))
  const anyDeadline = upcoming.find(explicitDeadline)
  const evening = Number.isInteger(localHour) && localHour >= 18 && localHour <= 23

  // Explicit near-term deadlines and early starts deserve attention.
  if (soonDeadline) return deadlineDescription(soonDeadline, no)
  if (tomorrow.length >= 3) return busyDescription(tomorrow, no, 1, early)
  if (early) return earlyDescription(early, no)

  // Earlier in the day, a particularly busy week day or important deadline
  // can provide more value than merely repeating an ordinary tomorrow item.
  const groupDays = new Map()
  for (const row of upcoming) {
    const existing = groupDays.get(row.days_until) || []
    existing.push(row)
    groupDays.set(row.days_until, existing)
  }
  const busyLater = [...groupDays.entries()]
    .filter(([day, entries]) => day >= 2 && entries.length >= 4)
    .sort((a,b) => a[0] - b[0])[0]
  if (!evening && anyDeadline) return deadlineDescription(anyDeadline, no)
  if (!evening && busyLater) return busyDescription(busyLater[1], no, busyLater[0])

  // After 18:00 the next morning/day has greater practical value.
  if (tomorrow.length > 0) return upcomingDescription(tomorrow[0], no)
  if (anyDeadline) return deadlineDescription(anyDeadline, no)
  if (busyLater) return busyDescription(busyLater[1], no, busyLater[0])

  return upcomingDescription(upcoming[0], no)
}
