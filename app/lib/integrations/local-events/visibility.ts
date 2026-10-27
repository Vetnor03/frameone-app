/**
 * Local Events is a frame-scoped integration, unlike account-wide calendar
 * providers. Do not leak another frame's event rows into the current frame's
 * app list simply because both frames belong to the same signed-in user.
 */
type ScopedIntegrationRow = {
  provider?: string | null
  device_id?: string | null
  raw?: Record<string, unknown> | null
}

export function localEventVisibleForActiveFrame(
  row: ScopedIntegrationRow,
  activeDeviceId: string | null,
  selectedAreaKey: string,
): boolean {
  if (row.provider !== 'edge-of-norway') return true
  if (!activeDeviceId || row.device_id !== activeDeviceId) return false

  if (!selectedAreaKey) return true
  const raw = row.raw || {}
  if (Array.isArray(raw.areaKeys)) return raw.areaKeys.includes(selectedAreaKey)
  return String(raw.areaKey || raw.primaryPlaceId || '').trim() === selectedAreaKey
}
