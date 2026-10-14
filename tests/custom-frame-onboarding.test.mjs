import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CUSTOM_SETUP_LAYOUT_SLOTS, CUSTOM_SETUP_MODULES, starterCustomCells, validateCustomSetup } from '../app/lib/onboardingCustomSetup.mjs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const onboarding = home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))
const completion = home.slice(home.indexOf('  async function completeFrameSetup('), home.indexOf('  async function customLayoutRequest('))

test('Custom setup supports every built-in layout without advanced custom geometry', () => {
  assert.deepEqual(CUSTOM_SETUP_LAYOUT_SLOTS, { default: 3, pyramid: 4, square: 4, full: 1 })
  assert.deepEqual(starterCustomCells('default'), { 0: 'date', 1: 'reminders', 2: 'news' })
  assert.deepEqual(starterCustomCells('pyramid'), { 0: 'date', 1: 'reminders', 2: 'news', 3: null })
  assert.deepEqual(starterCustomCells('full'), { 0: 'date' })
  assert.equal(starterCustomCells('invalid'), null)
  assert.ok(!CUSTOM_SETUP_MODULES.includes('assistant'))
  assert.match(home, /const SHOW_CUSTOM_LAYOUT_UI = false/)
  assert.match(onboarding, /allLayouts\(language\)\.map/)
  assert.match(onboarding, /<FrameLayoutRenderer/)
})

test('Custom setup must have a nonempty, valid, unique module selection', () => {
  assert.deepEqual(validateCustomSetup('pyramid', { 0: null, 1: null, 2: null, 3: null }, false), { valid: false, reason: 'no_modules' })
  assert.deepEqual(validateCustomSetup('invalid', { 0: 'date' }, true), { valid: false, reason: 'invalid_layout' })
  assert.deepEqual(validateCustomSetup('full', { 0: 'assistant' }, true), { valid: false, reason: 'invalid_module' })
  assert.deepEqual(validateCustomSetup('default', { 0: 'date', 1: 'date', 2: null }, true), { valid: false, reason: 'duplicate_module' })
  assert.deepEqual(validateCustomSetup('full', { 0: 'date' }, false), { valid: true, cells: { 0: 'date' }, weatherSelected: false, newsSelected: false })
})

test('Weather only requires a selected location when chosen as a visible module', () => {
  const noWeather = validateCustomSetup('pyramid', { 0: 'date', 1: 'reminders', 2: 'news', 3: null }, false)
  assert.equal(noWeather.valid, true)
  assert.equal(noWeather.weatherSelected, false)
  assert.deepEqual(validateCustomSetup('default', { 0: 'date', 1: 'weather', 2: null }, false), { valid: false, reason: 'weather_location' })
  const withWeather = validateCustomSetup('default', { 0: 'date', 1: 'weather', 2: null }, true)
  assert.equal(withWeather.valid, true)
  assert.equal(withWeather.weatherSelected, true)
  assert.match(onboarding, /customWeatherSelected && <div/)
  assert.match(onboarding, /hasChosenWeatherLocation\(modules\.weather\?\.\[0\]\)/)
  assert.match(completion, /if \(!checked\.weatherSelected\) delete nextModules\.weather/)
  assert.match(completion, /selection\.purpose === 'normal' &&/)
})

test('Custom finishes with selected layout and slots before the one initial frame render request', () => {
  assert.match(onboarding, /customLayout, customCellsByLayout \}\)/)
  assert.match(onboarding, /customLayout, customCells \}/)
  assert.match(onboarding, /disabled=\{saving \|\| !customSelection\.valid\}/)
  assert.match(completion, /validateCustomSetup\(selection\.customLayout, selection\.customCells/)
  assert.match(completion, /nextLayout = selection\.customLayout!/)
  assert.match(completion, /\[nextLayout\]: checked\.cells/)
  assert.match(completion, /cells: cellsMapToArray\(currentCellsForLayout\)/)
  assert.match(completion, /await supabase\.rpc\('complete_initial_device_onboarding'/)
  assert.equal((completion.match(/await requestDeviceUpdate\(/g) || []).length, 1)
  assert.ok(completion.indexOf("complete_initial_device_onboarding") < completion.indexOf('await requestDeviceUpdate('))
  assert.doesNotMatch(onboarding, /finish\('custom'\)[\s\S]*Open frame editor/)
})
