export type StarterLanguage = 'en' | 'no'

export type StarterReminder = {
  key: string
  title: string
  dueDate: string
  repeatType: 'none' | 'yearly'
}

export type StarterCountdown = { key: string; title: string; targetDate: string }

const ymd = (date: Date) => date.toISOString().slice(0, 10)

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day))
}

function nextFixedDate(month: number, day: number, now: Date) {
  const today = ymd(now)
  let candidate = utcDate(now.getUTCFullYear(), month, day)
  if (ymd(candidate) < today) candidate = utcDate(now.getUTCFullYear() + 1, month, day)
  return ymd(candidate)
}

/** Gregorian Easter Sunday (Meeus/Jones/Butcher), valid for all product dates. */
export function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return utcDate(year, month, day)
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export const MOVABLE_NORWAY_STARTER_KEYS = new Set([
  'mothers-day', 'fathers-day', 'maundy-thursday', 'good-friday',
  'easter-monday', 'ascension-day', 'whit-monday',
])

/** Resolve a starter key for a specific year; null means ordinary recurrence. */
export function norwegianStarterReminderDate(key: string, year: number): string | null {
  if (key === 'mothers-day') return ymd(nthWeekdayOfMonth(year, 2, 0, 2))
  if (key === 'fathers-day') return ymd(nthWeekdayOfMonth(year, 11, 0, 2))
  const offsets: Record<string, number> = {
    'maundy-thursday': -3,
    'good-friday': -2,
    'easter-monday': 1,
    'ascension-day': 39,
    'whit-monday': 50,
  }
  return key in offsets ? ymd(addUtcDays(easterSunday(year), offsets[key])) : null
}

export function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  const first = utcDate(year, month, 1)
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (nth - 1) * 7
  return utcDate(year, month, day)
}

function nextCalculated(now: Date, calculate: (year: number) => Date) {
  const thisYear = calculate(now.getUTCFullYear())
  return ymd(thisYear) >= ymd(now) ? ymd(thisYear) : ymd(calculate(now.getUTCFullYear() + 1))
}

/** Concise Norway-specific awareness set. Movable dates are materialized correctly. */
export function norwegianStarterReminders(language: StarterLanguage, now = new Date()): StarterReminder[] {
  const no = language === 'no'
  const item = (key: string, en: string, nb: string, dueDate: string, repeatType: 'none' | 'yearly' = 'none'): StarterReminder => ({ key, title: no ? nb : en, dueDate, repeatType })
  const easter = (offset: number) => nextCalculated(now, year => addUtcDays(easterSunday(year), offset))
  return [
    item('mothers-day', "Mother's Day", 'Morsdag', nextCalculated(now, year => nthWeekdayOfMonth(year, 2, 0, 2))),
    item('fathers-day', "Father's Day", 'Farsdag', nextCalculated(now, year => nthWeekdayOfMonth(year, 11, 0, 2))),
    item('new-year', "New Year's Day", 'Nyttårsdag', nextFixedDate(1, 1, now), 'yearly'),
    item('maundy-thursday', 'Maundy Thursday', 'Skjærtorsdag', easter(-3)),
    item('good-friday', 'Good Friday', 'Langfredag', easter(-2)),
    item('easter-monday', 'Easter Monday', 'Andre påskedag', easter(1)),
    item('labour-day', 'Labour Day', 'Arbeidernes dag', nextFixedDate(5, 1, now), 'yearly'),
    item('constitution-day', 'Constitution Day', '17. mai', nextFixedDate(5, 17, now), 'yearly'),
    item('ascension-day', 'Ascension Day', 'Kristi himmelfartsdag', easter(39)),
    item('whit-monday', 'Whit Monday', 'Andre pinsedag', easter(50)),
    item('christmas-day', 'Christmas Day', 'Første juledag', nextFixedDate(12, 25, now), 'yearly'),
    item('boxing-day', 'Boxing Day', 'Andre juledag', nextFixedDate(12, 26, now), 'yearly'),
  ]
}

export function norwegianStarterCountdowns(language: StarterLanguage, now = new Date()): StarterCountdown[] {
  const no = language === 'no'
  return [
    { key: 'constitution-day', title: no ? '17. mai' : 'Constitution Day', targetDate: nextFixedDate(5, 17, now) },
    { key: 'christmas-eve', title: no ? 'Julaften' : 'Christmas Eve', targetDate: nextFixedDate(12, 24, now) },
    { key: 'new-years-eve', title: no ? 'Nyttårsaften' : "New Year's Eve", targetDate: nextFixedDate(12, 31, now) },
  ]
}

export const OSLO_WEATHER = Object.freeze({ id: 1, label: 'Oslo, Norway', lat: 59.9139, lon: 10.7522, units: 'metric', refresh: 1800000, hiLo: true, cond: true })
