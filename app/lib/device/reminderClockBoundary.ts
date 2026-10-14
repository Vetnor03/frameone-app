/**
 * The physical Reminders feed uses wall-clock HH:mm values in Europe/Oslo.
 * Treat the scheduled minute as expired as soon as that minute begins.
 * This avoids leaving a just-started item on e-paper until another wake.
 *
 * Both inputs must be normalized 24-hour HH:mm strings.
 */
export function reminderClockBoundaryReached(boundaryHm: string, nowHm: string) {
  return nowHm >= boundaryHm
}
