import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('frame update text stays neutral until live status is resolved for the selected device', () => {
  assert.match(home, /frameStatusLoad\?\.deviceId !== activeDeviceId/)
  assert.match(home, /\? '' \/\/ Reserve the status line/)
  assert.match(home, /frameStatusLoad\.loaded/)
  assert.match(home, /Frame status unavailable/)
  assert.match(home, /No confirmed frame update yet/)
})

test('device changes reset status while stale requests cannot mark another frame ready', () => {
  assert.equal((home.match(/setFrameStatusLoad\(null\)/g) || []).length, 2)
  assert.match(home, /finally \{\s*if \(activeDeviceIdRef\.current === deviceId\) \{/)
  assert.match(home, /current\?\.deviceId === deviceId && current\.loaded/)
})

test('cached content revalidates silently and only failed validation shows an offline warning', () => {
  assert.match(home, /isCachedLaunchPreview && cachedPreviewSyncFailed &&/)
  assert.match(home, /OFFLINE PREVIEW/)
  assert.doesNotMatch(home, /\{cachedPreviewSyncFailed \? 'OFFLINE PREVIEW' : 'SYNCING…'\}/)
  assert.doesNotMatch(home, /bottom-3 text-center text-\[10px\]/)
})
