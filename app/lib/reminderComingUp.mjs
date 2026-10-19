// Deterministic, privacy-preserving short outlook for spare space in medium
// Reminders. Only derive claims from actual upcoming device reminder items;
// no model calls, fabricated preparation steps or third-party data transfers.
const MAX_OUTLOOK_CHARS = 78
const MAX_TITLE_CHARS = 43
const asInt = value => Number.isInteger(Number(value)) ? Number(value) : null
const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
const time = value => { const t = text(value); return /^([01]\d|2[0-3]):[0-5]\d$/.test(t.slice(0,5)) ? t.slice(0,5) : '' }
const norwegian = language => /^(no|nb|nn)(-|$)/i.test(String(language || ''))
function shortened(value) {
  const trimmed = text(value)
  if (trimmed.length <= MAX_TITLE_CHARS) return trimmed
  const prefix = trimmed.slice(0, MAX_TITLE_CHARS - 3)
  const boundary = prefix.lastIndexOf(' ')
  return (boundary > 16 ? prefix.slice(0, boundary) : prefix).trimEnd() + '...'
}
const weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdaysNo = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']
function weekday(date, no) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const parsed = new Date(date + 'T12:00:00Z')
  return Number.isNaN(parsed.getTime()) ? '' : (no ? weekdaysNo : weekdaysEn)[parsed.getUTCDay()]
}
function capped(value) {
  if (value.length <= MAX_OUTLOOK_CHARS) return value
  const cut = value.slice(0, MAX_OUTLOOK_CHARS - 3)
  const breakAt = cut.lastIndexOf(' ')
  return (breakAt > 35 ? cut.slice(0, breakAt) : cut).trimEnd().replace(/[.,:;!?]+$/, '') + '...'
}

/**
 * Show only for 1–2 reminders TODAY; don't repeat those titles.
 * Future candidates must be dated 1–7 days ahead.
 * Input is the already-authorized/filtered combined Reminders + Connect feed.
 */
export function buildReminderComingUp(items, language = 'en') {
  const rows = Array.isArray(items) ? items : []
  const today = rows.filter(row => asInt(row?.days_until) === 0 && text(row?.title))
  if (today.length < 1 || today.length > 2) return ''
  const no = norwegian(language)
  const upcoming = rows
    .filter(row => {
      const day = asInt(row?.days_until)
      return day != null && day >= 1 && day <= 7 && text(row?.title)
    })
    .sort((a,b) => asInt(a.days_until) - asInt(b.days_until) ||
      time(a.display_time).localeCompare(time(b.display_time)))
  if (!upcoming.length) return ''

  const tomorrow = upcoming.filter(row => asInt(row.days_until) === 1)
  // A busy following day matters more than a routine individual entry.
  if (tomorrow.length >= 3) {
    return no ? `I morgen har du ${tomorrow.length} avtaler eller gjøremål.`
      : `Tomorrow is busy, with ${tomorrow.length} things scheduled.`
  }
  const early = tomorrow.find(row => {
    const t = time(row.display_time)
    return t && t < '09:00'
  })
  const first = early || upcoming[0]
  const day = asInt(first.days_until)
  const title = shortened(first.title)
  const at = time(first.display_time)
  if (day === 1) return capped(no
    ? `I morgen${at ? ' kl. ' + at : ''}: ${title}.`
    : `Tomorrow${at ? ' at ' + at : ''}: ${title}.`)

  const weekdayName = weekday(text(first.occurrence_date).slice(0,10), no)
  if (!weekdayName) return ''
  return capped(no
    ? `På ${weekdayName}${at ? ' kl. ' + at : ''}: ${title}.`
    : `On ${weekdayName}${at ? ' at ' + at : ''}: ${title}.`)
}
