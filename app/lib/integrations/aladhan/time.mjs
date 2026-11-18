const zone = 'Europe/Oslo'
export function osloYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const v = k => parts.find(p => p.type === k)?.value || ''
  return v('year') + '-' + v('month') + '-' + v('day')
}
export function followingDays(count = 7, now = new Date()) {
  const first = osloYmd(now)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first + 'T12:00:00Z')
    date.setUTCDate(date.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}
// Convert a Norwegian local clock to UTC; DST-aware and reject nonexistent times.
export function osloWallClockToIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const target = Date.UTC(y, mo - 1, d, h, mi)
  if (new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10) !== date) return null
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const fields = ms => Object.fromEntries(formatter.formatToParts(new Date(ms)).map(p => [p.type, p.value]))
  let instant = target
  for (let i = 0; i < 4; i++) {
    const p = fields(instant)
    const perceived = Date.UTC(Number(p.year), Number(p.month)-1, Number(p.day), Number(p.hour), Number(p.minute))
    const next = instant + target - perceived
    if (next === instant) break
    instant = next
  }
  const p = fields(instant)
  if (p.year + '-' + p.month + '-' + p.day !== date || p.hour + ':' + p.minute !== time) return null
  return new Date(instant).toISOString()
}
