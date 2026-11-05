import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const firmware = await readFile('frame/src/frame_v2.5.1.ino', 'utf8')
const batteryH = await readFile('frame/src/device/BatteryManager.h', 'utf8')
const battery = await readFile('frame/src/device/BatteryManager.cpp', 'utf8')
const displayH = await readFile('frame/src/display/DisplayCore.h', 'utf8')
const display = await readFile('frame/src/display/DisplayCore.cpp', 'utf8')

test('battery state distinguishes unplugged recharge from USB recovery charging', () => {
  assert.match(batteryH, /bool recoveryCharging;/)
  assert.match(battery, /out\.requiresRecharge = \(!usbPresent && g_batteryRtc\.rechargeRequired\)/)
  assert.match(battery, /out\.recoveryCharging = \(usbPresent && g_batteryRtc\.rechargeRequired\)/)
})

test('Alfred reconstructs deep-discharge state after RTC loss', () => {
  assert.match(battery, /ALFRED_RECOVERY_SOC_PERCENT = 5\.0f/)
  assert.match(
    battery,
    /initialVoltage <= RECHARGE_SHUTDOWN_V \|\|[\s\S]*initialPercent <= \(int\)ALFRED_RECOVERY_SOC_PERCENT/,
  )
})

test('Alfred exits recovery from real battery voltage even if fuel-gauge SOC is stale', () => {
  const fn = battery.slice(
    battery.indexOf('static void updateRechargeRequired'),
    battery.indexOf('#else', battery.indexOf('static void updateRechargeRequired')),
  )
  assert.match(
    fn,
    /rawVoltage >= RECHARGE_RECOVERY_V &&[\s\S]*smoothedVoltage >= RECHARGE_RECOVERY_V/,
  )
  assert.doesNotMatch(fn, /g_max17048Soc >= ALFRED_RECOVERY_SOC_PERCENT/)
})

test('recovery charging performs no Wi-Fi work and rechecks once per minute', () => {
  const gate = firmware.slice(
    firmware.indexOf('if (battEarly.recoveryCharging)'),
    firmware.indexOf('if (g_recoveryChargingScreenDisplayed)'),
  )
  assert.match(gate, /showRecoveryChargingAndSleep\(battEarly, pwrEarly\)/)
  assert.doesNotMatch(gate, /connectSaved|LiveUpdate|Mqtt|BackendApi/)
  assert.match(firmware, /RECOVERY_RECHECK_US = 60ULL \* 1000000ULL/)
  assert.match(firmware, /esp_sleep_enable_timer_wakeup\(RECOVERY_RECHECK_US\)/)
})

test('charging recovery screen is painted once and automatically replaced on recovery', () => {
  assert.match(displayH, /void drawChargingRecoveryScreen\(\)/)
  assert.match(display, /const char\* line2 = "Charging\.\.\."/)
  assert.match(display, /Starting automatically when the battery is ready/)
  assert.match(firmware, /Recovery charging screen already displayed; skipping e-paper refresh/)
  assert.match(firmware, /Recovery charging complete -> resume normal plugged-in mode/)
  assert.match(firmware, /g_powerRefreshPending = true/)
  assert.match(firmware, /DisplayCore::forceNextFullRefresh\(true\)/)
})

test('unplugging during recovery returns to battery-empty protection', () => {
  assert.match(firmware, /enablePowerSenseWakeForNextSleep\(usbPresent\)/)
  assert.match(firmware, /if \(battEarly\.requiresRecharge\)[\s\S]*showRechargeAndSleep/)
})
