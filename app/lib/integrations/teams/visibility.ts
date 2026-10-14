/**
 * Microsoft/Teams meetings are reminders to arrive before the meeting starts.
 * Treat the start time as the completion cutoff and intentionally ignore the
 * event end time for frame/app visibility. Exclude a meeting at its exact
 * start timestamp so a wake during its start minute cannot leave it on e-paper.
 */
export function isTeamsMeetingVisibleAt(startsAt: string | null | undefined, now = new Date()) {
  if (!startsAt) return false
  const startsAtDate = new Date(startsAt)
  const startsAtTime = startsAtDate.getTime()
  if (!Number.isFinite(startsAtTime)) return false

  return startsAtTime > now.getTime()
}
