export type ReminderRepeatKey =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'weekdays'
  | '2weeks'
  | '4weeks'
  | 'monthly'
  | 'halfyear'
  | 'yearly'
  | '2years'
  | 'custom'

export function normalizeRepeatWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const days = [...new Set(
    value
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
  )].sort((a, b) => a - b)
  return days.length ? days : null
}

function addDaysLocal(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function addMonthsLocal(d: Date, months: number) {
  const x = new Date(d)
  const day = x.getDate()
  x.setDate(1)
  x.setMonth(x.getMonth() + months)
  const daysInTargetMonth = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  x.setDate(Math.min(day, daysInTargetMonth))
  return x
}

function addYearsLocal(d: Date, years: number) {
  const x = new Date(d)
  const month = x.getMonth()
  const day = x.getDate()
  x.setDate(1)
  x.setFullYear(x.getFullYear() + years)
  const daysInTargetMonth = new Date(x.getFullYear(), month + 1, 0).getDate()
  x.setMonth(month)
  x.setDate(Math.min(day, daysInTargetMonth))
  return x
}

export function isoWeekday(d: Date) {
  const day = d.getDay()
  return day === 0 ? 7 : day
}

export function firstReminderOccurrenceDate(
  base: Date,
  repeat: ReminderRepeatKey,
  repeatWeekdays?: number[] | null,
): Date | null {
  if (repeat !== 'weekdays') return new Date(base)
  const days = normalizeRepeatWeekdays(repeatWeekdays)
  if (!days) return null
  if (days.includes(isoWeekday(base))) return new Date(base)
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDaysLocal(base, offset)
    if (days.includes(isoWeekday(candidate))) return candidate
  }
  return null
}

export function nextReminderOccurrenceDate(
  base: Date,
  repeat: ReminderRepeatKey,
  customRepeatDays?: number | null,
  repeatWeekdays?: number[] | null,
): Date | null {
  if (repeat === 'none') return null
  if (repeat === 'daily') return addDaysLocal(base, 1)
  if (repeat === 'weekly') return addDaysLocal(base, 7)
  if (repeat === 'weekdays') {
    const days = normalizeRepeatWeekdays(repeatWeekdays)
    if (!days) return null
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = addDaysLocal(base, offset)
      if (days.includes(isoWeekday(candidate))) return candidate
    }
    return null
  }
  if (repeat === '2weeks') return addDaysLocal(base, 14)
  if (repeat === '4weeks') return addDaysLocal(base, 28)
  if (repeat === 'monthly') return addMonthsLocal(base, 1)
  if (repeat === 'halfyear') return addMonthsLocal(base, 6)
  if (repeat === 'yearly') return addYearsLocal(base, 1)
  if (repeat === '2years') return addYearsLocal(base, 2)

  if (repeat === 'custom') {
    const n = Number(customRepeatDays)
    if (Number.isFinite(n) && n > 0) return addDaysLocal(base, n)
  }

  return null
}
