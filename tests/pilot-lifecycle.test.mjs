import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { pilotEndedForDevice } from '../app/lib/device/pilotLifecycle.ts'

test('pilot control is opt-in and matches only exact selected device IDs', () => {
  assert.equal(pilotEndedForDevice('frm_A', ''), false)
  assert.equal(pilotEndedForDevice('frm_A', 'frm_AB'), false)
  assert.equal(pilotEndedForDevice('frm_A', '*'), false)
  assert.equal(pilotEndedForDevice('', ''), false)
  assert.equal(pilotEndedForDevice('frm_A', ' frm_B, frm_A '), true)
  assert.equal(pilotEndedForDevice('frm_B', ' frm_B, frm_A '), true)
  assert.equal(pilotEndedForDevice('frm_C', ' frm_B, frm_A '), false)
  assert.equal(pilotEndedForDevice('frm_a', 'frm_A'), false)
})

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const frame = read('frame/src/frame_v2.5.1.ino')
const live = read('frame/src/network/LiveUpdate.cpp')
const route = read('app/api/device/update-state/route.ts')

test('control is only returned after physical authentication and cannot be cached', () => {
  assert.ok(route.indexOf("if ('error' in auth)") < route.indexOf('pilot_ended:'))
  assert.match(route, /pilot_ended: pilotEndedForDevice\(deviceId\)/)
  assert.match(route, /private, no-store/)
})

test('reactivation requires an explicit boolean from server; older servers cannot clear a latch', () => {
  assert.match(live, /hasPilotState = doc\["pilot_ended"\]\.is<bool>\(\)/)
  assert.match(frame, /const bool resume = pwrEarly.usbPresent &&[\s\S]*?pilotState.hasPilotState && !pilotState.pilotEnded/)
  assert.ok(frame.indexOf('if (pilotEndedLocally())') < frame.indexOf('BatteryState battEarly'))
})

test('closing screen is persistent and uses shelf sleep, with redraw pending until restored', () => {
  const enter = frame.slice(frame.indexOf('static void enterPilotEndedShelf'), frame.indexOf('static bool probeWithPilotControl'))
  assert.ok(enter.indexOf('putBool("pilot_end", true)') < enter.indexOf('drawPilotEndedScreen()'))
  assert.match(enter, /putBool\("pilot_resume", true\)/)
  assert.match(enter, /if \(!drawn\)/)
  assert.match(enter, /displayPrefs.remove\("layout"\)/)
  assert.match(enter, /WiFi.mode\(WIFI_OFF\)/)
  assert.match(enter, /goToShelfSleep\(usbPresent\)/)
  const shelf = frame.slice(frame.indexOf('static void goToShelfSleep'), frame.indexOf('// Persist independently'))
  assert.match(shelf, /esp_sleep_disable_wakeup_source\(ESP_SLEEP_WAKEUP_ALL\)/)
  assert.doesNotMatch(shelf, /esp_sleep_enable_timer_wakeup/)
  assert.match(frame, /if \(g_pilotResumed \|\| .*scheduledModules = "all"/)
})
