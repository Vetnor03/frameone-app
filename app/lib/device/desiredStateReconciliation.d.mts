export function reconcilePersistedDesiredState(
  desiredSignature: string,
  persistedSignature: string
): { applyPersistedValues: boolean; dirty: boolean }
