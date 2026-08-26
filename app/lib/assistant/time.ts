/** Convert a user-entered wall-clock time on their local date to UTC. */
export function surfLoggedAt(date: 'today' | 'yesterday' | string, time: string, localNow: string, timezone: string | null) {
  const now = new Date(localNow)
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((part) => [part.type, part.value]))
  const base = new Date(`${dateParts.year}-${dateParts.month}-${dateParts.day}T${time}:00Z`)
  if (date === 'yesterday') base.setUTCDate(base.getUTCDate() - 1)
  if (!timezone) return base.toISOString()
  // Iterating handles DST offsets at the target wall-clock instant rather than
  // incorrectly applying the offset at `localNow`.
  let instant = base
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map((part) => [part.type, part.value]))
    const shownAsUtc = Date.UTC(Number(shown.year), Number(shown.month) - 1, Number(shown.day), Number(shown.hour), Number(shown.minute), Number(shown.second))
    instant = new Date(instant.getTime() - (shownAsUtc - base.getTime()))
  }
  return instant.toISOString()
}
