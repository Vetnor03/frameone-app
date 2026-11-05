import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const battery = await readFile('frame/src/device/BatteryManager.cpp', 'utf8')
const firmware = await readFile('frame/src/frame_v2.5.1.ino', 'utf8')

test('Alfred emergency voltage latches recharge regardless of USB presence', () => {
  const fn = battery.slice(
    battery.indexOf('static void updateRechargeRequired'),
    battery.indexOf('#else', battery.indexOf('static void updateRechargeRequired')),
  )
  const emergency = fn.indexOf('if (rawVoltage <= ALFRED_EMERGENCY_V)')
  const usbBranch = fn.indexOf('if (!usbPresent)')
  assert.ok(emergency >= 0 && emergency < usbBranch)
  assert.match(fn, /g_batteryRtc\.rechargeRequired = true/)
})

test('USB cannot hide a still-empty battery from recovery charging', () => {
  assert.match(
    battery,
    /if \(rawVoltage <= RECHARGE_SHUTDOWN_V \|\|[\s\S]*smoothedVoltage <= RECHARGE_SHUTDOWN_V\) \{[\s\S]*g_batteryRtc\.rechargeRequired = true/,
  )
  assert.match(firmware, /if \(battEarly\.recoveryCharging\)/)
  assert.match(firmware, /showRecoveryChargingAndSleep\(battEarly, pwrEarly\)/)
})

test('recovery exit is voltage based so a stale zero-percent fuel gauge cannot trap the frame', () => {
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
