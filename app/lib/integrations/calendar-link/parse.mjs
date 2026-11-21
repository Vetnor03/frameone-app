import ICAL from 'ical.js'

const MAX_EVENTS = 1600
const MAX_STEPS = 25000
const HORIZON_DAYS = 120
const pad = n => String(n).padStart(2, '0')
const ymd = t => `${t.year}-${pad(t.month)}-${pad(t.day)}`

function tzidFor(event) {
  return event.component.getFirstProperty('dtstart')?.getParameter('tzid') || null
}

function zonedDate(time, tzid) {
  if (time.isDate) return new Date(ymd(time) + 'T12:00:00Z')
  if (tzid) {
    // A bundled VTIMEZONE is handled by ICAL; IANA zones without VTIMEZONE
    // use Intl, which includes current DST transitions on the server.
    let fmt
    try {
      fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tzid, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      })
    } catch {
      // Vendor-specific TZIDs are supported only when the feed supplies VTIMEZONE.
      if (time.zone?.tzid === tzid && time.zone?.component) return time.toJSDate()
      throw new Error('This calendar uses an unsupported time zone')
    }
    let stamp = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second)
    const wall = stamp
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(fmt.formatToParts(new Date(stamp)).map(p => [p.type, p.value]))
      const actual = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second))
      const delta = wall - actual
      if (delta === 0) break
      stamp += delta
    }
    return new Date(stamp)
  }
  return time.toJSDate()
}

export function parseCalendarEvents(text, feedId, label, now = new Date()) {
  if (typeof text !== 'string' || text.length > 1024 * 1024 || !/^\s*BEGIN:VCALENDAR/i.test(text)) throw new Error('Invalid iCal calendar')
  const lower = new Date(now.getTime() - 86400000)
  const upper = new Date(now.getTime() + HORIZON_DAYS * 86400000)
  let calendar
  try { calendar = new ICAL.Component(ICAL.parse(text)) }
  catch { throw new Error('Could not read this calendar format') }
  if (calendar.name !== 'vcalendar') throw new Error('Not an iCal calendar')
  for (const zone of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone)
  const masters = []
  const exceptions = new Map()
  for (const component of calendar.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(component)
    if (!event.uid || !event.startDate) continue
    if (event.isRecurrenceException()) {
      const list = exceptions.get(event.uid) || []
      list.push(event)
      exceptions.set(event.uid, list)
    } else masters.push(event)
    if (masters.length + exceptions.size > 2500) throw new Error('Calendar contains too many events')
  }
  const results = []
  for (const event of masters) {
    for (const exception of exceptions.get(event.uid) || []) event.relateException(exception)
    const push = (details, occurrenceId) => {
      if (String(details.item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return
      const start = details.startDate
      const end = details.endDate || start
      const zone = tzidFor(details.item) || tzidFor(event)
      const startDate = zonedDate(start, zone)
      const endDate = zonedDate(end, zone)
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return
      if (startDate > upper || endDate < lower) return
      const title = String(details.item.summary || 'Busy').trim().slice(0, 160) || 'Busy'
      const location = String(details.item.location || '').trim().slice(0, 240)
      const uid = String(event.uid).slice(0, 260)
      results.push({
        external_id: feedId + ':' + uid + ':' + occurrenceId,
        title, body: location || null,
        starts_at: startDate.toISOString(), due_at: endDate.toISOString(),
        priority: 0,
        raw: { source: 'calendar-link', feed_id: feedId, calendar: label,
          all_day: start.isDate === true, date: start.isDate ? ymd(start) : null },
      })
      if (results.length > MAX_EVENTS) throw new Error('Calendar contains too many upcoming events')
    }
    if (String(event.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') continue
    if (!event.isRecurring()) {
      push({ item: event, startDate: event.startDate, endDate: event.endDate }, event.startDate.toString())
    } else {
      const iterator = event.iterator()
      let step = 0, occurrence
      while ((occurrence = iterator.next())) {
        if (++step > MAX_STEPS) throw new Error('Calendar recurrence is too large to import safely')
        // Recurrences are chronological by recurrence id. Details may shift due to overrides.
        const details = event.getOccurrenceDetails(occurrence)
        push(details, occurrence.toString())
        if (zonedDate(occurrence, tzidFor(event)) > upper) break
      }
    }
  }
  return results.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
