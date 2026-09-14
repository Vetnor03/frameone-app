const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const NO_MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
]

const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const NO_WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseYmd(value: string | null | undefined) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day, weekday: date.getUTCDay() }
}

function matchingOccurrenceSuffixes(occurrenceYmd: string | null | undefined) {
  const parts = parseYmd(occurrenceYmd)
  if (!parts) return []

  const enMonth = EN_MONTHS[parts.month - 1]
  const noMonth = NO_MONTHS[parts.month - 1]
  const enWeekday = EN_WEEKDAYS[parts.weekday]
  const noWeekday = NO_WEEKDAYS[parts.weekday]
  const day = String(parts.day)

  const englishDates = [
    `${day} ${enMonth}`,
    `${day} ${enMonth} ${parts.year}`,
    `${enMonth} ${day}`,
    `${enMonth} ${day}, ${parts.year}`,
  ]
  const norwegianDates = [
    `${day}. ${noMonth}`,
    `${day}. ${noMonth} ${parts.year}`,
    `${day} ${noMonth}`,
    `${day} ${noMonth} ${parts.year}`,
  ]

  const suffixes = new Set<string>()
  for (const dateText of englishDates) {
    suffixes.add(dateText)
    suffixes.add(`${enWeekday}, ${dateText}`)
    suffixes.add(`${enWeekday} ${dateText}`)
    suffixes.add(`${enWeekday}s, ${dateText}`)
    suffixes.add(`${enWeekday}s ${dateText}`)
    suffixes.add(`on ${enWeekday}, ${dateText}`)
    suffixes.add(`on ${enWeekday} ${dateText}`)
    suffixes.add(`on ${enWeekday}s, ${dateText}`)
    suffixes.add(`on ${enWeekday}s ${dateText}`)
  }
  for (const dateText of norwegianDates) {
    suffixes.add(dateText)
    suffixes.add(`${noWeekday}, ${dateText}`)
    suffixes.add(`${noWeekday} ${dateText}`)
    suffixes.add(`${noWeekday}er, ${dateText}`)
    suffixes.add(`${noWeekday}er ${dateText}`)
  }
  return [...suffixes].sort((a, b) => b.length - a.length)
}

function stripMatchingOccurrenceSuffix(title: string, occurrenceYmd: string | null | undefined) {
  for (const suffix of matchingOccurrenceSuffixes(occurrenceYmd)) {
    const pattern = new RegExp(`(?:\\s+|\\s*[-–—:|]\\s*)${escapeRegExp(suffix)}[.!]?\\s*$`, 'iu')
    if (!pattern.test(title)) continue
    const stripped = title.replace(pattern, '').trim()
    if (stripped) return stripped
  }
  return title
}

/**
 * Produces the human-facing Local Events title used by both the app and frame.
 * Cleanup is intentionally conservative: occurrence dates are removed only when
 * the trailing date text actually matches the event's own occurrence date.
 */
export function localEventDisplayTitle(rawTitle: string, occurrenceYmd?: string | null) {
  const original = normalizeWhitespace(rawTitle)
  if (!original) return ''

  let title = original

  // The provider sometimes prefixes cinema listings with the venue/category.
  title = title.replace(/^Sølvberget\s+cinematek\s*:\s*/iu, '')

  // Anniversary metadata is useful on the source page, but it should not force
  // the actual work/title name off a small reminder display.
  title = title.replace(/\s*[-–—]\s*\d+\s*(?:år|years?)\s*!?\s*$/iu, '')

  title = stripMatchingOccurrenceSuffix(title, occurrenceYmd)
  title = normalizeWhitespace(title).replace(/[\s,:;\-–—]+$/u, '').trim()

  return title || original
}
