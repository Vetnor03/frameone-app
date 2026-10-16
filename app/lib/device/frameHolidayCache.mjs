// Public national holiday data is safe to share between devices. A bounded,
// single-flight cache prevents duplicate cold requests from /frame-config and
// /render-state, while a timeout prevents a stalled provider blocking Update.
// Never cache user settings or auth credentials in this module.
const holidayCache = new Map()
const CACHE_MAX_KEYS = 24
const HOLIDAY_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000
const HOLIDAY_RETRY_TTL_MS = 60 * 1000
const DEFAULT_TIMEOUT_MS = 2500

function validatedHolidayItems(body) {
  const holidays = Array.isArray(body?.holidays) ? body.holidays : []
  return holidays.flatMap((holiday) => {
    const date = String(holiday?.date ?? '')
    const name = String(holiday?.name ?? '')
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && name ? [{ date, name }] : []
  })
}

// Returns null only when no year could be fetched. The caller can retain its
// existing configured fallback holidays instead of clearing the Date module.
export async function getFrameHolidayList({
  base, country, years, request = fetch, now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!base || !country || !Array.isArray(years) || years.length !== 2 ||
      !years.every((year) => Number.isInteger(year) && year >= 1970 && year <= 2200)) {
    return null
  }
  const key = JSON.stringify([base, country, years])
  const at = now()
  const cached = holidayCache.get(key)
  if (cached && cached.expiresAt > at) return cached.promise

  const entry = { expiresAt: at + timeoutMs + 5000, promise: null }
  const promise = Promise.all(years.map(async (year) => {
    try {
      const response = await request(
        `${base}/functions/v1/holidays?country=${encodeURIComponent(country)}&year=${year}`,
        { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) },
      )
      if (!response.ok) return null
      return validatedHolidayItems(await response.json())
    } catch {
      return null
    }
  })).then((results) => {
    // A partial year is not a durable cache hit; retry shortly.
    const allSucceeded = results.every((items) => items !== null)
    entry.expiresAt = now() + (allSucceeded ? HOLIDAY_SUCCESS_TTL_MS : HOLIDAY_RETRY_TTL_MS)
    return results.every((items) => items === null) ? null : results.flatMap((items) => items ?? [])
  }, () => {
    entry.expiresAt = now() + HOLIDAY_RETRY_TTL_MS
    return null
  })
  entry.promise = promise
  holidayCache.delete(key)
  holidayCache.set(key, entry)
  if (holidayCache.size > CACHE_MAX_KEYS) holidayCache.delete(holidayCache.keys().next().value)
  return promise
}
