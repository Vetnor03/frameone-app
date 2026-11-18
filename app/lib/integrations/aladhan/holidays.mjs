import { validDate } from './preview.mjs'

// Major observances rather than every historical/person-specific entry returned by
// the provider. Dates are computed by AlAdhan, not confirmed Norwegian dates.
export const HIJRI_OBSERVANCES = [
  { key: 'islamic-new-year', day: 1, month: 1, title: 'Islamsk nyttår' },
  { key: 'ashura', day: 10, month: 1, title: 'Ashura' },
  { key: 'mawlid', day: 12, month: 3, title: 'Mawlid' },
  { key: 'ramadan-start', day: 1, month: 9, title: 'Ramadan begynner' },
  { key: 'eid-al-fitr', day: 1, month: 10, title: 'Id al-fitr' },
  { key: 'arafah', day: 9, month: 12, title: 'Arafat-dagen' },
  { key: 'eid-al-adha', day: 10, month: 12, title: 'Id al-adha' },
]

export function hijriYearFromDate(date) {
  if (typeof date !== 'string' || !/^\d{2}-\d{2}-\d{4}$/.test(date)) return null
  const [day, month, year] = date.split('-').map(Number)
  return day >= 1 && day <= 30 && month >= 1 && month <= 12 && year >= 1400 && year <= 1700 ? year : null
}

export function hijriHolidayUrl(observance, year) {
  if (!HIJRI_OBSERVANCES.some(item => item.key === observance.key) ||
      !Number.isInteger(year) || year < 1400 || year > 1700) {
    throw Error('Invalid Hijri holiday query')
  }
  return 'https://api.aladhan.com/v1/hToG/' +
    String(observance.day).padStart(2, '0') + '-' +
    String(observance.month).padStart(2, '0') + '-' + year
}

export function normalizeHijriHoliday(payload, observance, year) {
  if (!payload || Number(payload.code) !== 200) return null
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  const hijri = data.hijri && typeof data.hijri === 'object' ? data.hijri : {}
  const gregorian = data.gregorian && typeof data.gregorian === 'object' ? data.gregorian : {}
  const hijriDate = String(observance.day).padStart(2, '0') + '-' +
    String(observance.month).padStart(2, '0') + '-' + year
  if (hijri.date && hijri.date !== hijriDate) return null
  const match = String(gregorian.date || '').match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!match) return null
  const ymd = match[3] + '-' + match[2] + '-' + match[1]
  if (!validDate(ymd)) return null
  return { ...observance, year, date: ymd, hijriDate }
}

export async function getAladhanHolidayDates(hijriDate, todayYmd, request = fetch) {
  const year = hijriYearFromDate(hijriDate)
  if (!year || !validDate(todayYmd)) return { dates: [], complete: false }
  const queries = [year, year + 1].flatMap(y =>
    HIJRI_OBSERVANCES.map(observance => ({ observance, year: y })))
  const results = await Promise.allSettled(queries.map(async ({ observance, year: y }) => {
    const response = await request(hijriHolidayUrl(observance, y), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 7 * 24 * 60 * 60 },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw Error('AlAdhan holiday conversion unavailable')
    const normalized = normalizeHijriHoliday(await response.json(), observance, y)
    if (!normalized) throw Error('Invalid AlAdhan holiday conversion')
    return normalized
  }))
  const end = new Date(Date.parse(todayYmd + 'T00:00:00Z') + 370 * 86400000).toISOString().slice(0, 10)
  return {
    complete: results.every(result => result.status === 'fulfilled'),
    dates: results.flatMap(result =>
      result.status === 'fulfilled' && result.value.date >= todayYmd && result.value.date <= end
        ? [result.value] : []).sort((a, b) => a.date.localeCompare(b.date)),
  }
}
