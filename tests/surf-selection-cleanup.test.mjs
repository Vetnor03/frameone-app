import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const selection = readFileSync(new URL('../app/lib/surf/swellSelection.ts', import.meta.url), 'utf8')
const experienceRoute = readFileSync(new URL('../app/api/surf/experience/log/route.ts', import.meta.url), 'utf8')
const experienceHelper = readFileSync(new URL('../app/lib/surf/logExperience.ts', import.meta.url), 'utf8')

test('surf swell selection policy is centralized with the live forecast energy gates', () => {
  assert.match(selection, /MIN_USABLE_SWELL_HEIGHT_M = 0\.35/)
  assert.match(selection, /MIN_USABLE_SWELL_PERIOD_S = 5/)
  assert.match(selection, /NEAR_FLAT_SWELL_HEIGHT_M = 0\.3/)
  assert.match(selection, /NEAR_FLAT_SWELL_PERIOD_S = 4/)
  assert.match(selection, /CLEARLY_STRONGER_ENERGY_RATIO = 1\.75/)
  assert.match(selection, /CLEARLY_STRONGER_CORRECTED_M = 0\.35/)
  assert.match(selection, /export function selectBestSurfSwell/)
  assert.match(selection, /buildCombinedScore/)
  assert.match(selection, /selectedMainSwellIndex/)
})

test('experience logging uses the shared selection policy instead of its own picker', () => {
  assert.match(experienceRoute, /selectBestSurfSwell/)
  assert.doesNotMatch(experienceRoute, /function pickLoggedSwell/)
  assert.match(experienceRoute, /picked\.combinedScore\.breakdown\?\.swellMixSignature/)
  assert.match(experienceRoute, /selected_swell_index: marine\.debug\.selected_swell_index/)
})

test('custom spot experience logs load the same direction profile fields used for scoring', () => {
  assert.match(experienceRoute, /swell_sector_start_deg/)
  assert.match(experienceRoute, /swell_sector_end_deg/)
  assert.match(experienceRoute, /swell_main_deg/)
  assert.match(experienceRoute, /wind_sector_start_deg/)
  assert.match(experienceRoute, /wind_sector_end_deg/)
  assert.match(experienceRoute, /wind_main_deg/)
  assert.match(experienceRoute, /customSpotProfileFromRow/)
})

test('surf experience snapshot helper also delegates swell selection', () => {
  assert.match(experienceHelper, /selectBestSurfSwell/)
  assert.doesNotMatch(experienceHelper, /function pickBestSwellForHour/)
  assert.match(experienceHelper, /combinedScore\.breakdown\?\.swellMixSignature/)
})
