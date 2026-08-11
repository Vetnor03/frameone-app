export const MANUAL_UPDATE_VISIBLE_MS = 2 * 60_000

export type PersistedManualUpdate = {
  phase: 'requesting' | 'updating'
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
    if (phase !== 'requesting' && phase !== 'updating') return null
    if (typeof value.requestId !== 'string' || value.requestId.length < 8) return null
    if (!Number.isFinite(value.requestedAt) || !Number.isFinite(value.deadline)) return null
    const revision = value.requestedRevision
    if (phase === 'updating' && (!Number.isSafeInteger(revision) || revision! < 0)) return null
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

export function manualUpdateEstimate(requestedAt: number, now = Date.now()) {
  const elapsed = Math.max(0, now - requestedAt)
  if (elapsed >= MANUAL_UPDATE_VISIBLE_MS) return null
  if (elapsed >= 105_000) return 'under15' as const
  if (elapsed >= 90_000) return 'under30' as const
  if (elapsed >= 60_000) return 'under1' as const
  return 'under2' as const
}

export function writeManualUpdate(storage: StorageLike, deviceId: string, update: PersistedManualUpdate) {
  storage.setItem(manualUpdateStorageKey(deviceId), JSON.stringify(update))
}

export function clearManualUpdate(storage: StorageLike, deviceId: string) {
  storage.removeItem(manualUpdateStorageKey(deviceId))
}

export function selectUpdatePresentation<T>(activeManualUpdate: boolean, manualPresentation: T, scheduledPresentation: T) {
  return activeManualUpdate ? manualPresentation : scheduledPresentation
}
