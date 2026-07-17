export type WatchUpdate = {
  id: string
  watch_id: string
  is_read: boolean
  created_at: string
}

function updateTime(update: Pick<WatchUpdate, 'created_at'>) {
  return new Date(update.created_at).getTime()
}

/** Select the current row for each Watch before applying inbox read state. */
export function selectNewestUnreadUpdates<T extends WatchUpdate>(updates: T[]): T[] {
  const newestByWatch = new Map<string, T>()

  for (const update of updates) {
    const current = newestByWatch.get(update.watch_id)
    if (!current || updateTime(update) > updateTime(current)) newestByWatch.set(update.watch_id, update)
  }

  return [...newestByWatch.values()]
    .filter((update) => !update.is_read)
    .sort((a, b) => updateTime(b) - updateTime(a))
}
