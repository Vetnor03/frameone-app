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
  if (JSON.stringify(stableJson(result?.saved_settings_json)) !== JSON.stringify(stableJson(settingsJson))) {
    throw new Error('Persisted frame settings did not match the requested draft.')
  }
  return result
}
