/**
 * Time-dependent integrated calendar entries disappear when their start minute
 * is reached. Date-only entries remain visible throughout their date.
 *
 * Manual reminders and waste collection retain their own, separate lifecycle.
 * Dates and clock values are normalized local YYYY-MM-DD and HH:mm strings.
 */
export function isUpcomingIntegratedCalendarItem(
  source: string | null | undefined,
  date: string,
  time: string | null | undefined,
  todayYmd: string,
  nowHm: string,
) {
  if (source !== 'teams' && source !== 'google-calendar' && source !== 'spond' && source !== 'local-events') return true
  if (date < todayYmd) return false
  if (date > todayYmd) return true
  return !time || time > nowHm
}
