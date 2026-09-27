// Keep News time-sensitive without retrying an unavailable RSS origin on every
// frame wake. The persistent cache is a fallback, never an unlimited archive.
export const NEWS_UPSTREAM_REFRESH_MS = 15 * 60_000
export const NEWS_MAX_STALE_MS = 2 * 60 * 60_000
export const NEWS_ERROR_RETRY_MS = 5 * 60_000

export type NewsCacheTiming = {
  now?: number
  refreshedAt?: string | null
  checkedAt?: string | null
  hasItems: boolean
}

function ageMs(value: string | null | undefined, now: number): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp > now + 60_000) return null
  return Math.max(0, now - timestamp)
}

export function newsCacheDecision(input: NewsCacheTiming) {
  const now = input.now ?? Date.now()
  const sourceAgeMs = ageMs(input.refreshedAt, now)
  const checkAgeMs = ageMs(input.checkedAt, now)
  return {
    fresh: input.hasItems && sourceAgeMs != null && sourceAgeMs < NEWS_UPSTREAM_REFRESH_MS,
    usableStale: input.hasItems && sourceAgeMs != null && sourceAgeMs < NEWS_MAX_STALE_MS,
    retryAllowed: checkAgeMs == null || checkAgeMs >= NEWS_ERROR_RETRY_MS,
    sourceAgeMs,
  }
}
