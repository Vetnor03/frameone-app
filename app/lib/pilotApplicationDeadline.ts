// 1 November 2026 23:59:59.999 in Europe/Oslo (CET, UTC+1).
// The application closes at midnight at the start of 2 November, local time.
export const PILOT_CLOSES_AT_UTC = '2026-11-01T23:00:00.000Z'
export const PILOT_CLOSES_AT_MS = Date.parse(PILOT_CLOSES_AT_UTC)
export const PILOT_DEADLINE_LABEL = '1. november 2026 kl. 23.59'

export function isPilotApplicationClosed(nowMs: number = Date.now()) {
  return nowMs >= PILOT_CLOSES_AT_MS
}
