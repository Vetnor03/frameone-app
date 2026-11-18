/** Caller filters past events before grouping; inputs use local YYYY-MM-DDTHH:mm. */
export function nextAladhanOccurrences<T>(
  items: readonly T[],
  getName: (item: T) => string | null | undefined,
  getLocalStart: (item: T) => string | null | undefined,
): T[]

/** Date-only Islamic occasions are kept alongside the next occurrence of each timed event. */
export function nextAladhanWithOccasions<T>(
  items: readonly T[],
  getName: (item: T) => string | null | undefined,
  getDate: (item: T) => string | null | undefined,
  getTime: (item: T) => string | null | undefined,
): T[]
