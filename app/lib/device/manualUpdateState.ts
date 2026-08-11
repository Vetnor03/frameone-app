export type ManualUpdateEstimate = { displayAt: number | null; instant: boolean }

export type PersistedManualUpdate = {
  phase: 'requesting' | 'updating' | 'unconfirmed'
  requestId: string
  requestedRevision: number | null
  requestedAt: number
  deadline: number
  estimate: ManualUpdateEstimate
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
    if (phase !== 'requesting' && phase !== 'updating' && phase !== 'unconfirmed') return null
    if (typeof value.requestId !== 'string' || value.requestId.length < 8) return null
    if (!Number.isFinite(value.requestedAt) || !Number.isFinite(value.deadline)) return null
    const revision = value.requestedRevision
    if (phase === 'updating' && (!Number.isSafeInteger(revision) || revision! < 0)) return null
    const estimate = value.estimate
    return {
      phase,
      requestId: value.requestId,
      requestedRevision: revision == null ? null : revision,
      requestedAt: value.requestedAt!,
      deadline: value.deadline!,
      estimate: {
        displayAt: Number.isFinite(estimate?.displayAt) ? estimate!.displayAt! : null,
        instant: estimate?.instant === true,
      },
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

export function selectUpdatePresentation<T>(activeManualUpdate: boolean, manualPresentation: T, scheduledPresentation: T) {
  return activeManualUpdate ? manualPresentation : scheduledPresentation
}
