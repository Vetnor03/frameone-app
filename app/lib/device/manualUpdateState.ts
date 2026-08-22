export type PersistedManualUpdate = {
  phase: 'requesting' | 'waiting_for_display'
  requestId: string
  requestedRevision: number | null
  requestedAt: number
  deadline: number
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEY_PREFIX = 'remind:manual-update:'

export function manualUpdateStorageKey(deviceId: string) {
  return `${KEY_PREFIX}${deviceId}`
}

export function readManualUpdate(storage: StorageLike, deviceId: string): PersistedManualUpdate | null {
  try {
    const value = JSON.parse(storage.getItem(manualUpdateStorageKey(deviceId)) || 'null') as Partial<PersistedManualUpdate> | null
    if (!value) return null
    const phase = value.phase
    if (phase !== 'requesting' && phase !== 'waiting_for_display') return null
    if (typeof value.requestId !== 'string' || value.requestId.length < 8) return null
    if (!Number.isFinite(value.requestedAt) || !Number.isFinite(value.deadline)) return null
    const revision = value.requestedRevision
    if (phase === 'waiting_for_display' && (!Number.isSafeInteger(revision) || revision! < 0)) return null
    return {
      phase,
      requestId: value.requestId,
      requestedRevision: revision == null ? null : revision,
      requestedAt: value.requestedAt!,
      deadline: value.deadline!,
    }
  } catch {
    return null
  }
}

export function writeManualUpdate(storage: StorageLike, deviceId: string, update: PersistedManualUpdate) {
  storage.setItem(manualUpdateStorageKey(deviceId), JSON.stringify(update))
}

export function clearManualUpdate(storage: StorageLike, deviceId: string) {
  storage.removeItem(manualUpdateStorageKey(deviceId))
}

export async function requestManualUpdateRevision(
  requestId: string,
  deadline: number,
  request: (requestId: string) => Promise<number>,
  options: {
    now?: () => number
    sleep?: (milliseconds: number) => Promise<void>
    retryDelayMs?: number
  } = {}
): Promise<number | null> {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const retryDelayMs = Math.max(100, options.retryDelayMs ?? 1_000)

  while (now() < deadline) {
    try {
      return await request(requestId)
    } catch {
      const remainingMs = deadline - now()
      if (remainingMs <= 0) break
      await sleep(Math.min(retryDelayMs, remainingMs))
    }
  }
  return null
}
