import { preserveStoredModuleLocations } from './preserveModuleLocations.mjs'

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]))
}

export async function saveFrameSettings({ deviceId, settingsJson, accessToken, fetchImpl = fetch }) {
  const response = await fetchImpl('/api/device/save-settings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ device_id: deviceId, settings_json: settingsJson }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'Unable to save frame settings.')

  // Do not publish a display revision here. Verify the complete draft which
  // the database returned before the caller performs the explicit request.
  const persistedJson = JSON.stringify(stableJson(result?.saved_settings_json))
  if (persistedJson !== JSON.stringify(stableJson(settingsJson))) {
    // The server may have rescued known-good locations from a stale/empty
    // draft. Accept only those explicitly reported location repairs; reject
    // any other mismatch so an unrelated settings write cannot silently drift.
    const recovered = preserveStoredModuleLocations(result?.saved_settings_json, settingsJson)
    const protectedKeys = Array.isArray(result?.protected_module_locations) ? result.protected_module_locations : []
    const recoveredKeysMatch = protectedKeys.length > 0 &&
      JSON.stringify([...recovered.preserved].sort()) === JSON.stringify([...protectedKeys].sort())
    if (!recoveredKeysMatch || JSON.stringify(stableJson(recovered.settingsJson)) !== persistedJson) {
      throw new Error('Persisted frame settings did not match the requested draft.')
    }
  }
  return result
}
