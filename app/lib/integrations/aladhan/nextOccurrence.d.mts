/** Caller filters past events before grouping; inputs use local YYYY-MM-DDTHH:mm. */
export function nextAladhanOccurrences<T>(
  items: readonly T[],
  getName: (item: T) => string | null | undefined,
  getLocalStart: (item: T) => string | null | undefined,
): T[]
