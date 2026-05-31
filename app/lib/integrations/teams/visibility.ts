const MS_PER_MINUTE = 60 * 1000

function floorDateToMinute(date: Date) {
  return Math.floor(date.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE
}

/**
 * Microsoft/Teams meetings are reminders to arrive before the meeting starts.
 * Treat the start time as the completion cutoff and intentionally ignore the
 * event end time for frame/app visibility. The current minute stays visible to
 * avoid display flicker around the exact start second.
 */
export function isTeamsMeetingVisibleAt(startsAt: string | null | undefined, now = new Date()) {
  if (!startsAt) return false
  const startsAtDate = new Date(startsAt)
  const startsAtTime = startsAtDate.getTime()
  if (!Number.isFinite(startsAtTime)) return false

  return startsAtTime >= floorDateToMinute(now)
}
