import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const firmware = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const renderer = readFileSync(new URL('../frame/src/modules/ModuleRenderer.cpp', import.meta.url), 'utf8')
const reminders = readFileSync(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../frame/src/core/Layout.cpp', import.meta.url), 'utf8')

test('Reminders preload is gated by active committed physical assignments and called once', () => {
  const render = firmware.slice(firmware.indexOf('static bool renderLoadedDashboard'), firmware.indexOf('static uint64_t explicitTimingRevision'))
  assert.match(render, /activeAssignments = g_cfg\.layout == LAYOUT_CUSTOM/)
  assert.match(render, /strncmp\(activeAssignments\[i\]\.module, "reminders", 9\)/)
  assert.equal((render.match(/ModuleReminders::preload\(\)/g) || []).length, 1)
  assert.match(render, /if \(remindersActive\) ModuleReminders::preload\(\)/)
})

test('physical geometry selects compact, standard and spacious variants in one feed request', () => {
  assert.match(reminders, /c\.h <= 120 \|\| c\.w < 250[^]*PROFILE_COMPACT/)
  assert.match(reminders, /c\.w >= 600 && c\.h >= 360[^]*PROFILE_SPACIOUS/)
  assert.match(reminders, /display_profiles=/)
  assert.match(reminders, /profile_titles[^]*compactTitle[^]*standardTitle[^]*spaciousTitle/)
  assert.match(reminders, /void render\(const Cell& c[^]*ensureLoaded\(\);\s*applyProfileTitles\(c\);/)
  assert.match(layout, /mask \|= ModuleReminders::profileForCell\(cells\[i\]\)/)
  assert.equal((reminders.match(/httpGetAuth\(/g) || []).length, 1)
})

test('render diagnostics identify module instance or slot without dynamic diagnostic buffers', () => {
  assert.match(firmware, /Render timing reminders_preload_ms=/)
  assert.match(firmware, /Render timing total_ms=/)
  assert.match(renderer, /Render timing module=%s slot=%u ms=%lu/)
  assert.doesNotMatch(renderer, /String timing/)
})
