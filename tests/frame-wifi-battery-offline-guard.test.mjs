import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const firmware = await readFile('frame/src/frame_v2.5.1.ino', 'utf8')

test('battery Wi-Fi reconnects are strictly bounded per wake', () => {
  assert.match(firmware, /WIFI_CONNECT_ATTEMPT_TIMEOUT_MS\s*=\s*8000/)
  assert.match(firmware, /WIFI_CONNECT_ATTEMPTS_PER_WAKE\s*=\s*2/)
  assert.match(
    firmware,
    /for \(uint8_t attempt = 1; attempt <= WIFI_CONNECT_ATTEMPTS_PER_WAKE; \+\+attempt\)/,
  )
  assert.match(
    firmware,
    /WiFiManagerV2::connectSaved\(WIFI_CONNECT_ATTEMPT_TIMEOUT_MS\)/,
  )
})

test('three failed battery wake cycles arm passive offline shelf sleep', () => {
  assert.match(firmware, /WIFI_FAILED_WAKE_CYCLES_BEFORE_OFFLINE\s*=\s*3/)
  assert.match(firmware, /RTC_DATA_ATTR static uint8_t g_wifiFailedWakeCycles = 0/)
  assert.match(firmware, /RTC_DATA_ATTR static bool g_wifiOfflineLock = false/)
  assert.match(
    firmware,
    /g_wifiFailedWakeCycles >= WIFI_FAILED_WAKE_CYCLES_BEFORE_OFFLINE[\s\S]*g_wifiOfflineLock = true;[\s\S]*goToShelfSleep\(false\)/,
  )
})

test('paired startup failures on battery never fall through to provisioning', () => {
  assert.match(
    firmware,
    /pairedOperationalFrame && !pwrEarly\.usbPresent[\s\S]*connectSavedBatteryBounded\(\)/,
  )
  assert.match(
    firmware,
    /if \(pairedOperationalFrame && !pwrEarly\.usbPresent\) \{[\s\S]*sleepAfterBatteryWifiFailure\(\);[\s\S]*return;/,
  )
})

test('interactive battery disconnect uses the same bounded guard', () => {
  assert.match(
    firmware,
    /Wi-Fi disconnected on battery; starting bounded reconnect[\s\S]*connectSavedBatteryBounded\(\)[\s\S]*sleepAfterBatteryWifiFailure\(\)/,
  )
})

test('USB insertion or a local reset clears the offline lock', () => {
  assert.match(firmware, /pwrEarly\.usbPresent[\s\S]*resetWifiFailureGuard\("USB present"\)/)
  assert.match(
    firmware,
    /wakeCause == ESP_SLEEP_WAKEUP_UNDEFINED[\s\S]*resetWifiFailureGuard\("cold boot\/reset"\)/,
  )
})

test('offline lock explicitly disables Wi-Fi and preserves e-paper by shelf sleeping', () => {
  assert.match(
    firmware,
    /offline shelf lock active; staying passive[\s\S]*WiFi\.disconnect\(true, false\);[\s\S]*WiFi\.mode\(WIFI_OFF\);[\s\S]*goToShelfSleep\(false\)/,
  )
})
