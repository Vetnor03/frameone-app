import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { preserveStoredModuleLocations } from '../app/lib/device/preserveModuleLocations.mjs'
import { saveFrameSettings } from '../app/lib/device/saveFrameSettings.mjs'

const weather = [{ id: 1, label: 'Stavanger', lat: 58.97, lon: 5.73 }]
const surf = [{ id: 1, spot: "Today's Best", spotId: '__todays_best__' }]
const surfForecast = { spot: 'Hellestø', spotId: 'hellesto' }
const stored = { theme: 'dark', modules: { weather, surf, surf_forecast: surfForecast, integrations: { todoist: true } } }

test('an empty or omitted modules snapshot cannot erase saved Weather and Surf locations', () => {
  for (const next of [{}, { modules: {} }, { modules: { weather: [], surf: [], surf_forecast: null } }]) {
    const result = preserveStoredModuleLocations(stored, { theme: 'light', ...next })
    assert.deepEqual(result.settingsJson.modules.weather, weather)
    assert.deepEqual(result.settingsJson.modules.surf, surf)
    assert.deepEqual(result.settingsJson.modules.surf_forecast, surfForecast)
    assert.equal(result.settingsJson.theme, 'light')
    assert.deepEqual(result.preserved.sort(), ['surf', 'surf_forecast', 'weather'].sort())
  }
})

test('a deliberate valid change replaces old locations while saving other module settings', () => {
  const nextWeather = [{ id: 1, label: 'Bergen', lat: 60.39, lon: 5.32 }]
  const nextSurf = [{ id: 1, spot: 'Bore', spotId: 'bore' }]
  const nextForecast = { spot: 'Bore', spotId: 'bore' }
  const result = preserveStoredModuleLocations(stored, {
    theme: 'light',
    modules: { weather: nextWeather, surf: nextSurf, surf_forecast: nextForecast, integrations: { google: true } },
  })
  assert.deepEqual(result.preserved, [])
  assert.deepEqual(result.settingsJson.modules, {
    weather: nextWeather, surf: nextSurf, surf_forecast: nextForecast, integrations: { google: true },
  })
})

test('only absent locations are restored; other module changes remain authoritative', () => {
  const result = preserveStoredModuleLocations(stored, {
    modules: { weather, surf: [], integrations: { google: true } },
  })
  assert.deepEqual(result.preserved.sort(), ['surf', 'surf_forecast'])
  assert.deepEqual(result.settingsJson.modules.integrations, { google: true })
  assert.deepEqual(result.settingsJson.modules.weather, weather)
  assert.deepEqual(result.settingsJson.modules.surf, surf)
  assert.deepEqual(result.settingsJson.modules.surf_forecast, surfForecast)
})

test('Weather and Surf tabs never present empty pickers while server settings load', () => {
  const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(source, /\(moduleKey === 'weather' \|\| moduleKey === 'surf'\) && loadedSettingsDeviceId !== activeDeviceId/)
  assert.match(source, /cachedPreviewSyncFailed/)
})

test('a confirmed server location recovery is accepted and returned for app rehydration', async () => {
  const submitted = { theme: 'light', modules: { weather: [], surf: [], surf_forecast: null } }
  const saved = preserveStoredModuleLocations(stored, submitted)
  const result = await saveFrameSettings({
    deviceId: 'frame-test',
    settingsJson: submitted,
    accessToken: 'dummy',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        saved_settings_json: saved.settingsJson,
        protected_module_locations: saved.preserved,
        updated_at: '2026-11-22T12:00:00Z',
      }),
    }),
  })
  assert.deepEqual(result.saved_settings_json.modules.weather, weather)
  assert.deepEqual(result.saved_settings_json.modules.surf, surf)
  assert.deepEqual(result.saved_settings_json.modules.surf_forecast, surfForecast)
})

test('unexpected Supabase settings drift still fails readback verification', async () => {
  await assert.rejects(
    saveFrameSettings({
      deviceId: 'frame-test',
      settingsJson: { theme: 'light', modules: { weather } },
      accessToken: 'dummy',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          saved_settings_json: { theme: 'dark', modules: { weather } },
          protected_module_locations: [],
          updated_at: '2026-11-22T12:00:00Z',
        }),
      }),
    }),
    /did not match/,
  )
})
