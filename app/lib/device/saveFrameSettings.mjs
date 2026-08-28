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

  // The revision request must not proceed unless the database returned the
  // same legacy frame theme that this update intended to store.
  if (result?.saved_settings_json?.theme !== settingsJson.theme) {
    throw new Error('Saved frame theme did not match the selected frame theme.')
  }
  return result
}
