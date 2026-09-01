import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const saveRoute = readFileSync(new URL('../app/api/device/save-settings/route.ts', import.meta.url), 'utf8')
const saveStart = home.indexOf('async function performSettingsSave')
const updateStart = home.indexOf('async function runExplicitUpdate')
const updateEnd = home.indexOf('async function logout', updateStart)
const update = home.slice(updateStart, updateEnd)

test('frame edits remain a dirty local draft with no autosave or activity heartbeat', () => {
  assert.match(home, /markDirty\(\{layoutKey:key,cellsByLayout:nextCells\}\)/)
  assert.doesNotMatch(home, /LIVE_UPDATE_SAVE_DEBOUNCE_MS|createLatestStateDebouncer|liveUpdateDebounceRef|sendDeviceActivity|DEVICE_ACTIVITY_HEARTBEAT_MS/)
  assert.equal((home.slice(0, saveStart).match(/saveFrameSettings\(/g) || []).length, 0)
  assert.equal((home.slice(0, updateStart).match(/requestDeviceUpdate\(/g) || []).length, 0)
})

test('save-settings persists settings only and publishes no revision', () => {
  assert.match(saveRoute, /settings_json: settingsJson/)
  assert.doesNotMatch(saveRoute, /request_device_display_revision|requested_revision/)
})

test('explicit update snapshots, saves, then requests exactly one fresh revision', () => {
  const save = update.indexOf('await performSettingsSave(deviceId)')
  const uuid = update.indexOf('crypto.randomUUID()')
  const request = update.indexOf('await requestDeviceUpdate(supabase, deviceId, requestId)')
  assert.ok(save >= 0 && save < uuid && uuid < request)
  assert.equal((update.match(/requestDeviceUpdate\(/g) || []).length, 1)
  assert.doesNotMatch(update, /status\.requestedRevision > status\.displayedRevision|desired-|\?\?=/)
})

test('manual failure semantics keep update retryable', () => {
  assert.match(update, /if \(!saved[\s\S]*setExplicitUpdateStatus\('idle'\)/)
  assert.match(update, /catch \{[\s\S]*setDirty\(true\)[\s\S]*setExplicitUpdateStatus\('idle'\)/)
  assert.match(home, /manualUpdateInProgress = explicitUpdateStatus !== 'idle'/)
  assert.match(home, /layoutFlow\|\|dirty[\s\S]*2aa3ff/)
})

test('status polling exists only inside accepted-operation waiters', () => {
  const calls = [...home.matchAll(/getDeviceUpdateStatus\(/g)].map((m) => m.index)
  assert.ok(calls.length > 0)
  assert.ok(calls.every((index) => index > updateStart || (index > home.indexOf('const persisted = readManualUpdate') && index < saveStart)))
  assert.doesNotMatch(home, /setInterval\([^\n]*getDeviceUpdateStatus/)
})
