// Verified IRN Hijri month starts, annual occasions, and official translations.
// Always use IRN's mapping; never use an independent Hijri calendar calculation.
const row = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const number = value => typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN
const validMonth = value => Number.isInteger(value) && value >= 1 && value <= 12
const validDay = value => Number.isInteger(value) && value >= 1 && value <= 30
const validYear = value => Number.isInteger(value) && value >= 1300 && value <= 1700
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
const toDayNumber = value => Math.floor(Date.parse(value + 'T12:00:00Z') / 86400000)
const addDays = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)

export function normalizeIrnMonthStarts(payload) {
  if (!Array.isArray(payload)) return []
  const seen = new Set()
  return payload.map(value => {
    const data = row(value)
    const day = number(data.hijri_date_day)
    const month = number(data.hijri_date_month)
    const year = number(data.hijri_date_year)
    const date = data.gregorian_date
    const key = year + ':' + month
    if (day !== 1 || !validMonth(month) || !validYear(year) || !validDate(date) || seen.has(key)) return null
    seen.add(key)
    return { day, month, year, date, remark: typeof data.remark === 'string' ? data.remark : null }
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))
}

export function normalizeIrnMonthLabels(payload) {
  if (!Array.isArray(payload)) return []
  const seen = new Set()
  return payload.map(value => {
    const data = row(value)
    const month = number(data.hijri_date_month)
    const no = String(data.no ?? '').trim()
    const en = String(data.en ?? '').trim()
    const ar = String(data.ar ?? '').trim()
    if (!validMonth(month) || !no || !en || !ar || seen.has(month)) return null
    seen.add(month)
    return { month, no, en, ar, short: String(data.name_short ?? '').trim(), long: String(data.name_long ?? '').trim() }
  }).filter(Boolean)
}

export function normalizeIrnAnnualEvents(payload) {
  if (!Array.isArray(payload)) return []
  const seen = new Set()
  return payload.map(value => {
    const data = row(value)
    const month = number(data.hijri_date_month)
    const day = number(data.hijri_date_day)
    const no = String(data.no ?? '').trim()
    const en = String(data.en ?? '').trim()
    const ar = String(data.ar ?? '').trim()
    const key = month + ':' + day + ':' + no
    if (!validMonth(month) || !validDay(day) || !no || !en || !ar || seen.has(key)) return null
    seen.add(key)
    return { month, day, no, en, ar }
  }).filter(Boolean)
}

export function buildIrnCalendarOccurrences({ mapping, months, events, today, horizonEnd }) {
  if (!validDate(today) || !validDate(horizonEnd) || today > horizonEnd) return []
  const starts = normalizeIrnMonthStarts(mapping)
  const monthList = normalizeIrnMonthLabels(months)
  const eventList = normalizeIrnAnnualEvents(events)
  if (starts.length < 2 || monthList.length !== 12 || eventList.length === 0) return []
  const labels = new Map(monthList.map(item => [item.month, item]))
  const occasions = []
  const seenIds = new Set()
  for (let i = 0; i < starts.length - 1; i++) {
    const start = starts[i]
    const next = starts[i + 1]
    // Require consecutive, IRN-confirmed month boundaries, including the Hijri year rollover.
    const nextMonth = start.month === 12 ? 1 : start.month + 1
    const nextYear = start.month === 12 ? start.year + 1 : start.year
    const monthLength = toDayNumber(next.date) - toDayNumber(start.date)
    if (next.month !== nextMonth || next.year !== nextYear || (monthLength !== 29 && monthLength !== 30)) continue
    const monthLabels = labels.get(start.month)
    if (!monthLabels) continue
    const append = (kind, day, label, index) => {
      if (day > monthLength) return
      const date = addDays(start.date, day - 1)
      if (date < today || date > horizonEnd) return
      const id = kind + ':' + start.year + ':' + start.month + ':' + day + ':' + index
      if (seenIds.has(id)) return
      seenIds.add(id)
      occasions.push({
        id, date, kind, year: start.year, month: start.month, day,
        no: label.no, en: label.en, ar: label.ar,
      })
    }
    append('month_start', 1, monthLabels, 0)
    for (const [index, occasion] of eventList.entries()) {
      if (occasion.month === start.month) append('annual_event', occasion.day, occasion, index)
    }
  }
  return occasions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
