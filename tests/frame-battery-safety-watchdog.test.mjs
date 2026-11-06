import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const firmware = await readFile('frame/src/frame_v2.5.1.ino', 'utf8')
const provisioning = await readFile('frame/src/device/ProvisioningPortal.cpp', 'utf8')

test('long-running interactive mode independently rechecks battery every 30 seconds on either power source', () => {
  assert.match(firmware, /BATTERY_AWAKE_SAFETY_INTERVAL_MS\s*=\s*30000/)
  assert.match(
    firmware,
    /while \(true\) \{[\s\S]*millis\(\) - lastBatterySafetyCheckAtMs[\s\S]*enforceBatteryCutoffDuringAwake\("interactive mode"/,
  )
  const watchdog = firmware.slice(
    firmware.indexOf('static bool enforceBatteryCutoffDuringAwake'),
    firmware.indexOf('// --------------------------------------\n// Device status post', firmware.indexOf('static bool enforceBatteryCutoffDuringAwake')),
  )
  assert.match(watchdog, /BatteryManager::readAndUpdate\(pwr\.usbPresent\)/)
  assert.match(watchdog, /batt\.recoveryCharging/)
  assert.doesNotMatch(watchdog, /if \(pwr\.usbPresent\) return true/)
})

test('awake battery cutoff shuts radio down before recharge sleep', () => {
  assert.match(
    firmware,
    /Battery safety watchdog: protection reached[\s\S]*WiFi\.disconnect\(true, false\);[\s\S]*WiFi\.mode\(WIFI_OFF\);[\s\S]*showRecoveryChargingAndSleep[\s\S]*showRechargeAndSleep/,
  )
})

test('pairing is charger-only and exits immediately when USB is removed', () => {
  assert.match(
    firmware,
    /Pairing requires USB power -> passive pairing shelf[\s\S]*return PAIRING_EXPIRED/,
  )
  assert.match(
    firmware,
    /while \(\(millis\(\) - t0\) < maxPollMs\)[\s\S]*Pairing: USB removed -> return to passive pairing shelf[\s\S]*return PAIRING_EXPIRED/,
  )
})

test('provisioning cannot start or remain indefinitely on battery', () => {
  assert.match(
    firmware,
    /Setup Wi-Fi required but USB is absent -> passive shelf sleep[\s\S]*goToShelfSleep\(false\)/,
  )
  assert.match(provisioning, /Provisioning: USB removed -> restart into passive battery state/)
  assert.match(provisioning, /if \(!usbPresentNow\(\)\)[\s\S]*ESP\.restart\(\)/)
})

test('OTA is deferred on battery without a healthy reserve', () => {
  assert.match(firmware, /OTA_MIN_BATTERY_PERCENT\s*=\s*30/)
  assert.match(firmware, /OTA_MIN_BATTERY_V\s*=\s*3\.65f/)
  assert.match(
    firmware,
    /!pwr\.usbPresent[\s\S]*batt\.percent < OTA_MIN_BATTERY_PERCENT[\s\S]*batt\.rawVoltage < OTA_MIN_BATTERY_V[\s\S]*OTA deferred/,
  )
  assert.match(firmware, /runOtaCheckIfDue\(batt, pwr\)/)
})


test('startup USB reconnect loop re-samples power and switches to bounded battery policy after unplug', () => {
  const start = firmware.indexOf('while (pwrEarly.usbPresent && pairedOperationalFrame)')
  const end = firmware.indexOf('if (WiFi.status() != WL_CONNECTED)', start)
  const loop = firmware.slice(start, end)
  assert.match(loop, /readPowerSenseDebug\(\)/)
  assert.match(loop, /BatteryManager::readAndUpdate\(pwrEarly\.usbPresent\)/)
  assert.match(loop, /battEarly\.recoveryCharging/)
  assert.match(loop, /Startup reconnect: USB removed -> switch to bounded battery Wi-Fi policy/)
  assert.match(loop, /connectSavedBatteryBounded\(\)/)
  assert.match(loop, /sleepAfterBatteryWifiFailure\(\)/)
})
