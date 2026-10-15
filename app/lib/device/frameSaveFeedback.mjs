/**
 * Last physical render at or after a saved config is our only evidence that
 * the frame has had an opportunity to apply it. Do not label a save "displayed"
 * just because the API accepted it.
 */
export function frameSaveFeedbackPhase(savedAt, lastRenderAt) {
  const savedMs = typeof savedAt === 'string' ? Date.parse(savedAt) : NaN
  if (!Number.isFinite(savedMs)) return null
  const renderMs = typeof lastRenderAt === 'string' ? Date.parse(lastRenderAt) : NaN
  return Number.isFinite(renderMs) && renderMs >= savedMs ? 'confirmed' : 'waiting'
}

/**
 * An acknowledged exact display revision confirms the save even when the
 * separate device heartbeat's last_render_at is delayed. Never let an old
 * revision confirm a different, newer settings save.
 */
export function confirmFrameSaveForRevision(current, deviceId, savedAt) {
  if (!current || !savedAt || current.deviceId !== deviceId || current.savedAt !== savedAt || current.phase !== 'waiting') {
    return current
  }
  return { ...current, phase: 'confirmed' }
}
