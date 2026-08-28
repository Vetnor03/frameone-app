import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createFrameThemeSelection, normalizeFrameTheme, withSelectedFrameTheme } from '../app/lib/device/frameThemeSelection.mjs'

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

test('a frame selection is immediately saveable before React commits its render', () => {
  const selection = createFrameThemeSelection('dark')
  const renderedFrameTheme = 'dark'

  selection.select('light')

  assert.equal(renderedFrameTheme, 'dark', 'simulates the stale React closure')
  assert.equal(selection.snapshot(), 'light', 'the save boundary sees the click synchronously')
  assert.equal(withSelectedFrameTheme({ theme: renderedFrameTheme }, selection).theme, 'light')
})

test('frame and app theme stores remain behaviorally independent', () => {
  const selection = createFrameThemeSelection('dark')
  let appTheme = 'light'

  selection.select('light')
  assert.equal(appTheme, 'light')
  appTheme = 'dark'
  assert.equal(selection.snapshot(), 'light')
})

test('frame theme normalization preserves light and dark and defaults only invalid values', () => {
  assert.equal(normalizeFrameTheme('light'), 'light')
  assert.equal(normalizeFrameTheme('dark'), 'dark')
  for (const missing of [undefined, null, '', 'LIGHT', 'blue']) {
    assert.equal(normalizeFrameTheme(missing), 'dark')
  }
})

test('custom layout fields cannot replace the freshly selected frame theme', () => {
  const selection = createFrameThemeSelection('dark')
  selection.select('light')
  const customLayout = { layout: 'custom', cells: [{ slot: 0 }], theme: 'dark' }

  assert.deepEqual(withSelectedFrameTheme(customLayout, selection), {
    layout: 'custom', cells: [{ slot: 0 }], theme: 'light',
  })
})

test('firmware parses, stores and applies the fetched frame theme before rendering', () => {
  assert.match(configHeader, /ThemeKey theme = THEME_DARK/)
  assert.match(configSource, /settings\["theme"\] \| "dark"/)
  assert.match(configSource, /out\.theme = parseTheme/)
  assert.match(firmware, /Theme::set\(g_cfg\.theme\)[\s\S]*Layout::drawWithContent/)
  assert.ok(firmware.indexOf('Theme::set(g_cfg.theme)') < firmware.indexOf('ensureDisplay();', firmware.indexOf('static bool renderLoadedDashboard')))
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
