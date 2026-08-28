import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const home = read('app/HomePageClient.tsx')
const builder = read('app/api/device/frame-config/builder.ts')
const configHeader = read('frame/src/core/FrameConfig.h')
const configSource = read('frame/src/core/FrameConfig.cpp')
const themeHeader = read('frame/src/core/Theme.h')
const themeSource = read('frame/src/core/Theme.cpp')
const firmware = read('frame/src/frame_v2.5.1.ino')
const display = read('frame/src/display/DisplayCore.cpp')
const moduleSources = [
  'frame/src/modules/ModuleCountdown.cpp',
  'frame/src/modules/ModuleDate.cpp',
  'frame/src/modules/ModuleReminders.cpp',
  'frame/src/modules/ModuleStocks.cpp',
].map(read).join('\n')

test('frame theme persists independently and is included in device settings', () => {
  assert.match(home, /theme: frameTheme/)
  assert.match(home, /upsert_device_settings[\s\S]*p_settings: settingsJson/)
  assert.match(home, /onPickFrame=\{\(t\) => \{[\s\S]*setFrameTheme\(t\)[\s\S]*markDirty\(\{ frameTheme: t \}\)/)
  assert.match(home, /onPickApp=\{\(t\) => \{[\s\S]*setAppTheme\(t\)[\s\S]*user_app_preferences/)
})

test('device payload always carries a validated frame theme with dark fallback', () => {
  assert.match(builder, /function normalizeFrameTheme\(value: unknown\)/)
  assert.match(builder, /return value === 'light' \? 'light' : 'dark'/)
  assert.match(builder, /settings_json = \{ \.\.\.settings_json, theme: normalizeFrameTheme\(settings_json\.theme\) \}/)
})

test('firmware parses, stores and applies the fetched frame theme before rendering', () => {
  assert.match(configHeader, /ThemeKey theme = THEME_DARK/)
  assert.match(configSource, /settings\["theme"\] \| "dark"/)
  assert.match(configSource, /out\.theme = parseTheme/)
  assert.match(firmware, /Theme::set\(g_cfg\.theme\)[\s\S]*Layout::drawWithContent/)
})

test('semantic renderer palette selects opposite light and dark pigments', () => {
  for (const role of ['background', 'foreground', 'secondaryText', 'divider', 'fill', 'onFill']) {
    assert.match(themeHeader, new RegExp(`uint16_t ${role}\\(\\)`))
  }
  assert.match(themeSource, /THEME_DARK[\s\S]*g_paper = GxEPD_BLACK[\s\S]*g_ink = GxEPD_WHITE/)
  assert.match(themeSource, /else[\s\S]*g_paper = GxEPD_WHITE[\s\S]*g_ink = GxEPD_BLACK/)
  assert.match(display, /fillScreen\(Theme::paper\(\)\)/)
  assert.doesNotMatch(moduleSources, /GxEPD_(?:BLACK|WHITE)/)
  assert.match(moduleSources, /Theme::fill\(\)/)
  assert.match(moduleSources, /Theme::onFill\(\)/)
})
