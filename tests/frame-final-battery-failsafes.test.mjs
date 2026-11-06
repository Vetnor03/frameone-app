import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const firmware = await readFile('frame/src/frame_v2.5.1.ino', 'utf8')
const battery = await readFile('frame/src/device/BatteryManager.cpp', 'utf8')

test('Alfred latches recharge immediately at the empty voltage', () => {
  const fn = battery.slice(
    battery.indexOf('static void updateRechargeRequired'),
    battery.indexOf('#else', battery.indexOf('static void updateRechargeRequired')),
  )
  assert.match(
    fn,
    /if \(!usbPresent\)[\s\S]*rawVoltage <= RECHARGE_SHUTDOWN_V \|\|[\s\S]*smoothedVoltage <= RECHARGE_SHUTDOWN_V[\s\S]*g_batteryRtc\.rechargeRequired = true/,
  )
  assert.doesNotMatch(
    fn,
    /if \(!usbPresent\)[\s\S]*lowVoltageCount\+\+[\s\S]*lowVoltageCount >= ALFRED_LOW_VOLTAGE_SAMPLES/,
  )
})

test('MAX17048 read failure fails safe instead of continuing on stale battery data', () => {
  const start = battery.indexOf('if (!readMax17048Sample(sample))')
  const end = battery.indexOf('const float rawVoltage = sample.voltage', start)
  const failure = battery.slice(start, end)
  assert.match(failure, /MAX17048 unavailable -> entering fail-safe battery protection/)
  assert.match(failure, /g_batteryRtc\.rechargeRequired = true/)
  assert.match(failure, /retained\.requiresRecharge = !usbPresent/)
  assert.match(failure, /retained\.recoveryCharging = usbPresent/)
})

test('deep-sleep preparation failure is bounded and never parks the CPU awake forever', () => {
  const start = firmware.indexOf('static void prepareDisplayForSleep()')
  const end = firmware.indexOf('static const uint64_t PWR_SENSE_WAKE_MASK', start)
  const fn = firmware.slice(start, end)
  assert.match(fn, /for \(uint8_t attempt = 1; attempt <= 3; \+\+attempt\)/)
  assert.match(fn, /WiFi\.disconnect\(true, false\)/)
  assert.match(fn, /WiFi\.mode\(WIFI_OFF\)/)
  assert.doesNotMatch(fn, /while \(true\)/)
})

test('deeply discharged USB recovery does not power the e-paper panel', () => {
  assert.match(firmware, /RECOVERY_DISPLAY_MIN_V\s*=\s*3\.35f/)
  const start = firmware.indexOf('static void showRecoveryChargingAndSleep')
  const end = firmware.indexOf('static bool enforceBatteryCutoffDuringAwake', start)
  const fn = firmware.slice(start, end)
  assert.match(fn, /isnan\(batt\.rawVoltage\) \|\| batt\.rawVoltage < RECOVERY_DISPLAY_MIN_V/)
  assert.match(fn, /preserving existing e-paper image/)
})


test('severe or unknown discharge skips the battery-empty e-paper refresh', () => {
  assert.match(firmware, /RECHARGE_DISPLAY_MIN_V\s*=\s*3\.20f/)
  const start = firmware.indexOf('static void showRechargeAndSleep')
  const end = firmware.indexOf('static void showRecoveryChargingAndSleep', start)
  const fn = firmware.slice(start, end)
  assert.match(fn, /!isnan\(batt\.rawVoltage\) && batt\.rawVoltage >= RECHARGE_DISPLAY_MIN_V/)
  assert.match(fn, /Battery too low\/unknown for recharge-screen refresh/)
})

test('battery diagnostics distinguish recharge from USB recovery charging', () => {
  assert.match(battery, /Serial\.print\(" recharge="\)/)
  assert.match(battery, /Serial\.print\(" recovery="\)/)
  assert.match(battery, /state\.recoveryCharging \? 1 : 0/)
})
