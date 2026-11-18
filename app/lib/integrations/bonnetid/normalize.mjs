// Pure normalization for IRN's Zebra Bønnetid API. Never calculate substitute prayer times.
const NORWAY_TZ = 'Europe/Oslo'
const pad = (value) => String(value).padStart(2, '0')
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const list = (value, keys) => {
  if (Array.isArray(value)) return value
  const object = record(value)
  for (const key of keys) if (Array.isArray(object[key])) return object[key]
  return []
}

export function normalizeBonnetidLocations(payload) {
  const rows = list(payload, ['results', 'data', 'locations', 'items', 'result'])
  const seen = new Set()
  return rows.map((item) => {
    const row = record(item)
    const rawId = row.id ?? row.location_id ?? row.pk
    const id = String(rawId ?? '').trim()
    const name = String(row.name ?? row.location_name ?? row.city ?? row.title ?? row.display_name ?? '').trim()
    if (!/^\d{1,8}$/.test(id) || !name || seen.has(id)) return null
    seen.add(id)
    return { id, name }
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'nb-NO'))
}

export function normalizeBonnetidTime(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null
  const hour = Number(match[1]), minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return pad(hour) + ':' + pad(minute)
}

export function normalizeBonnetidDay(rawValue, date) {
  const outer = record(rawValue)
  const data = record(outer.prayer_times ?? outer.prayertimes ?? outer.times ?? outer)
  const fields = [
    ['Fajr', data.fajr],
    ['Dhuhr', data.duhr ?? data.dhuhr ?? data.zuhr],
    ['Asr', data.asr_2x_shadow ?? data.asr_2x ?? data.asr],
    ['Maghrib', data.maghrib],
    ['Isha', data.isha],
  ]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  if (!fields.every(([, value]) => normalizeBonnetidTime(value))) return []
  return fields.map(([name, value]) => ({ date, name, time: normalizeBonnetidTime(value) }))
}

function parseDate(value, year, month) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return value.slice(0, 10)
  const integer = typeof value === 'object' ? NaN : Number(value)
  if (Number.isInteger(integer) && integer >= 1 && integer <= 31) return year + '-' + pad(month) + '-' + pad(integer)
  const nested = record(value)
  const next = nested.gregorian_date ?? nested.date ?? nested.day ?? null
  if (next === value) return null
  return parseDate(next, year, month)
}

export function normalizeBonnetidMonth(payload, year, month) {
  let rows = list(payload, ['results', 'data', 'prayertimes', 'prayer_times', 'items', 'result'])
  // Some monthly endpoints return a YYYY-MM-DD keyed object rather than a list.
  if (!rows.length) rows = Object.entries(record(payload)).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([date, value]) => ({ ...record(value), gregorian_date: date }))
  const byDate = new Map()
  for (const item of rows) {
    const row = record(item)
    const date = parseDate(row.gregorian_date ?? row.date ?? row.day ?? record(row.meta).date ?? null, year, month)
    if (!date || !date.startsWith(year + '-' + pad(month) + '-')) continue
    const times = normalizeBonnetidDay(row, date)
    if (times.length === 5) byDate.set(date, times)
  }
  return [...byDate.values()].flat()
}

// Converts official Oslo wall-clock times to instants, including winter/summer time.
// Rejects nonexistent wall times instead of silently displaying incorrect hours.
export function bonnetidLocalToIso(date, time) {
  const normalized = normalizeBonnetidTime(time)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !normalized) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = normalized.split(':').map(Number)
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute)
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) return null
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: NORWAY_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  let instant = targetUtc
  const partsFor = (ms) => Object.fromEntries(formatter.formatToParts(new Date(ms)).map(p => [p.type, p.value]))
  for (let i = 0; i < 4; i++) {
    const p = partsFor(instant)
    const apparentUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
    const updated = instant + targetUtc - apparentUtc
    if (updated === instant) break
    instant = updated
  }
  const p = partsFor(instant)
  if (p.year + '-' + p.month + '-' + p.day !== date || p.hour + ':' + p.minute !== normalized) return null
  return new Date(instant).toISOString()
}
