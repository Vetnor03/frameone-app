import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CUSTOM_SETUP_LAYOUT_SLOTS, CUSTOM_SETUP_MODULES, starterCustomCells, validateCustomSetup } from '../app/lib/onboardingCustomSetup.mjs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const onboarding = home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))
const completion = home.slice(home.indexOf('  async function completeFrameSetup('), home.indexOf('  async function customLayoutRequest('))

test('customization is available inside the app, not in first-time setup', () => {
  assert.match(home, /const SHOW_CUSTOM_LAYOUT_UI = true/)
  assert.match(home, /onCellTap=\{openPicker\}/)
  assert.match(home, /function openPicker\(slot: number\)/)
  assert.match(home, /function beginCreateLayout\(\)/)
  assert.match(home, /function beginEditLayout\(layout:/)
  assert.match(home, /<InlineCustomLayoutEditor/)
  assert.doesNotMatch(onboarding, /setupPurposes|Choose your setup|Velg oppsett|customSelection|<FrameLayoutRenderer|CUSTOM_SETUP_MODULES/)
  assert.match(onboarding, /useState<'weather' \| 'connect'>/)
})

test('legacy custom layout helpers remain intact for future editing', () => {
  assert.deepEqual(CUSTOM_SETUP_LAYOUT_SLOTS, { default: 3, pyramid: 4, square: 4, full: 1 })
  assert.deepEqual(starterCustomCells('default'), { 0: 'date', 1: 'reminders', 2: 'news' })
  assert.deepEqual(starterCustomCells('pyramid'), { 0: 'date', 1: 'reminders', 2: 'news', 3: null })
  assert.deepEqual(starterCustomCells('full'), { 0: 'date' })
  assert.equal(starterCustomCells('invalid'), null)
  assert.deepEqual(validateCustomSetup('full', { 0: 'date' }, false), { valid: true, cells: { 0: 'date' }, weatherSelected: false, newsSelected: false })
  assert.deepEqual(validateCustomSetup('full', { 0: 'stocks' }, true), { valid: false, reason: 'invalid_module' })
  assert.ok(!CUSTOM_SETUP_MODULES.includes('soccer'))
})

test('every new frame commits the usable standard layout once, with later editing optional', () => {
  assert.match(completion, /nextLayout = 'pyramid'/)
  assert.match(completion, /0: 'date', 1: 'reminders', 2: 'weather', 3: 'news'/)
  assert.match(completion, /nextModules\.news = \{ \.\.\.savedNews, feed: 'top' \}/)
  assert.match(completion, /cells: cellsMapToArray\(currentCellsForLayout\)/)
  assert.match(completion, /await supabase\.rpc\('complete_initial_device_onboarding'/)
  assert.equal((completion.match(/await requestDeviceUpdate\(/g) || []).length, 1)
  assert.doesNotMatch(completion, /validateCustomSetup|selection\.purpose/)
})
