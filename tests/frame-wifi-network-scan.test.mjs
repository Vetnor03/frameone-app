import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const portal = await readFile('frame/src/device/ProvisioningPortal.cpp', 'utf8')

test('the frame scans while hosting the existing provisioning access point', () => {
  assert.match(portal, /WiFi\.mode\(WIFI_AP_STA\)/)
  assert.match(portal, /WiFi\.scanNetworks\(false, false\)/)
  assert.ok(portal.indexOf('scanNearbyNetworks();') < portal.indexOf('server.begin();'))
})

test('scan results are deduplicated and sorted by strongest signal first', () => {
  assert.match(portal, /network\.ssid == ssid/)
  assert.match(portal, /return a\.rssi > b\.rssi/)
})

test('scan results do not consume persistent DRAM', () => {
  assert.doesNotMatch(portal, /static std::vector<ScannedNetwork> scannedNetworks/)
  assert.match(portal, /const std::vector<ScannedNetwork> scannedNetworks = scanNearbyNetworks\(\)/)
})

test('the portal selects a detected SSID and retains a hidden-network fallback', () => {
  assert.match(portal, /type='radio' name='ssid'/)
  assert.match(portal, />Enter network manually</)
  assert.match(portal, /name='manual_ssid'/)
  assert.match(portal, /if \(ssid\.length\(\) == 0\) ssid = server\.arg\("ssid"\)/)
})
