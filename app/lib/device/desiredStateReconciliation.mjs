export function reconcilePersistedDesiredState(desiredSignature, persistedSignature) {
  const desiredStillMatches = desiredSignature === persistedSignature
  return {
    applyPersistedValues: desiredStillMatches,
    dirty: !desiredStillMatches,
  }
}
