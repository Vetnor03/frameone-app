import assert from 'node:assert/strict'
import test from 'node:test'
import { saveFrameSettings } from '../app/lib/device/saveFrameSettings.mjs'

test('manual frame save sends and confirms the selected legacy frame theme before revision request', async () => {
  const events = []
  const settingsJson = { theme: 'light', layout: 'default', cells: [] }
  const fetchImpl = async (_url, init) => {
    const submitted = JSON.parse(init.body)
    events.push(['saved', submitted.settings_json.theme])
    return {
      ok: true,
      json: async () => ({ ok: true, saved_settings_json: submitted.settings_json, updated_at: 'now', requested_revision: 1 }),
    }
  }

  await saveFrameSettings({ deviceId: 'frame-1', settingsJson, accessToken: 'token', fetchImpl })
  events.push(['revision-requested', 1])

  assert.deepEqual(events, [['saved', 'light'], ['revision-requested', 1]])
})

test('manual frame save blocks the revision when persisted theme does not match', async () => {
  let revisionRequested = false
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ ok: true, saved_settings_json: { theme: 'dark' }, updated_at: 'now', requested_revision: 1 }),
  })

  await assert.rejects(async () => {
    await saveFrameSettings({ deviceId: 'frame-1', settingsJson: { theme: 'light' }, accessToken: 'token', fetchImpl })
    revisionRequested = true
  }, /did not match/)
  assert.equal(revisionRequested, false)
})

test('app theme is not part of the device settings save contract', async () => {
  let submitted
  await saveFrameSettings({
    deviceId: 'frame-1',
    settingsJson: { theme: 'light', layout: 'default' },
    accessToken: 'token',
    fetchImpl: async (_url, init) => {
      submitted = JSON.parse(init.body)
      return { ok: true, json: async () => ({ ok: true, saved_settings_json: submitted.settings_json, requested_revision: 1 }) }
    },
  })
  assert.deepEqual(submitted.settings_json, { theme: 'light', layout: 'default' })
  assert.equal('appTheme' in submitted.settings_json, false)
})
