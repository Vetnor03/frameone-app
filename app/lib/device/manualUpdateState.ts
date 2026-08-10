export type ManualUpdatePhase =
  | 'idle'
  | 'manual_waiting'
  | 'manual_under_1m'
  | 'manual_under_30s'
  | 'manual_device_awake'
  | 'manual_complete'
  | 'manual_failed'

export type ManualUpdateRecord = {
  deviceId: string
  phase: Exclude<ManualUpdatePhase, 'idle'>
  requestedAt: number
  requestedRevision: number | null
  lastProbeAt: number | null
}

export type ManualUpdateRecords = Record<string, ManualUpdateRecord>

const STORAGE_KEY = 'remind:manual-update-state:v1'
const WAKE_INTERVAL_MS = 2 * 60_000

const phaseRank: Record<ManualUpdatePhase, number> = {
  idle: 0,
  manual_waiting: 1,
  manual_under_1m: 2,
  manual_under_30s: 3,
  manual_device_awake: 4,
  manual_complete: 5,
  manual_failed: 5,
}

export function loadManualUpdateRecords(): ManualUpdateRecords {
  if (typeof window === 'undefined') return {}
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return value && typeof value === 'object' ? value as ManualUpdateRecords : {}
  } catch {
    return {}
  }
}

export function persistManualUpdateRecords(records: ManualUpdateRecords) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function isManualUpdateActive(phase: ManualUpdatePhase) {
  return phase !== 'idle' && phase !== 'manual_complete' && phase !== 'manual_failed'
}

/** Derive display state from device timestamps, while enforcing one-way progress. */
export function deriveManualUpdatePhase(
  current: ManualUpdatePhase,
  now: number,
  requestedAt: number,
  lastProbeAt: number | null,
  completed: boolean
): ManualUpdatePhase {
  if (completed) return 'manual_complete'
  if (current === 'manual_complete' || current === 'manual_failed' || current === 'manual_device_awake') return current

  let candidate: ManualUpdatePhase
  if (lastProbeAt != null && lastProbeAt >= requestedAt) {
    candidate = 'manual_device_awake'
  } else {
    const expectedWakeAt = lastProbeAt != null
      ? lastProbeAt + WAKE_INTERVAL_MS
      : requestedAt + WAKE_INTERVAL_MS
    const remaining = expectedWakeAt - now
    candidate = remaining > 60_000
      ? 'manual_waiting'
      : remaining > 30_000
        ? 'manual_under_1m'
        : 'manual_under_30s'
  }

  return phaseRank[candidate] > phaseRank[current] ? candidate : current
}

export function formatManualUpdatePhase(phase: ManualUpdatePhase, language: 'en' | 'no') {
  const no = language === 'no'
  if (phase === 'manual_waiting') return no ? 'Oppdatering om mindre enn 2 minutter' : 'Update in less than 2 minutes'
  if (phase === 'manual_under_1m') return no ? 'Oppdatering om mindre enn 1 minutt' : 'Update in less than 1 minute'
  if (phase === 'manual_under_30s') return no ? 'Oppdatering om mindre enn 30 sekunder' : 'Update in less than 30 seconds'
  if (phase === 'manual_device_awake') return no ? 'Oppdatering om mindre enn 15 sekunder' : 'Update in less than 15 seconds'
  if (phase === 'manual_failed') return no
    ? 'Oppdateringen er lagret. RE:MIND har ikke bekreftet skjermoppdateringen ennå.'
    : 'Update saved. RE:MIND has not confirmed the display refresh yet.'
  return null
}
