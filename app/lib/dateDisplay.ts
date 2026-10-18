/** User-facing dates in RE:MIND are always day–month–year in both languages.
 * Keep ISO YYYY-MM-DD values for persistence, APIs and calendar arithmetic. */
export type AppDateLanguage = 'en' | 'no'

function fromIsoYmd(value: string): { year: number; month: number; day: number; date: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  // Use UTC noon to prevent client timezone and DST from moving the calendar day.
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day, date }
}

export function formatAppNumericDate(ymd: string): string {
  const parsed = fromIsoYmd(ymd)
  if (!parsed) return ymd || '--'
  return `${String(parsed.day).padStart(2, '0')}.${String(parsed.month).padStart(2, '0')}.${parsed.year}`
}

export function formatAppDate(
  ymd: string,
  language: AppDateLanguage,
  { weekday = false }: { weekday?: boolean } = {},
): string {
  const parsed = fromIsoYmd(ymd)
  if (!parsed) return ymd || '--'
  return new Intl.DateTimeFormat(language === 'no' ? 'nb-NO' : 'en-GB', {
    ...(weekday ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed.date)
}
