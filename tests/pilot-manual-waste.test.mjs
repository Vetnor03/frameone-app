import test from 'node:test'
import assert from 'node:assert/strict'
import { PILOT_WASTE_SCHEDULES, pilotWasteScheduleForAddress } from '../app/lib/integrations/waste/pilotManualSchedules.ts'

test('Trondheim pilot schedule uses only the six exact dates and fractions supplied by Trondheim Renholdsverk', () => {
  const schedule = pilotWasteScheduleForAddress('Haldor Flatens veg', '27', '7081')
  assert.ok(schedule)
  assert.equal(PILOT_WASTE_SCHEDULES.length, 1)
  assert.equal(schedule.source.includes('Trondheim Renholdsverk'), true)
  assert.deepEqual(schedule.pickups, [
    { date: '2026-11-03', fractions: ['restavfall', 'matavfall'] },
    { date: '2026-11-17', fractions: ['matavfall', 'papir'] },
    { date: '2026-12-01', fractions: ['restavfall', 'matavfall'] },
    { date: '2026-12-08', fractions: ['plast', 'glass_metall'] },
    { date: '2026-12-15', fractions: ['matavfall', 'papir'] },
    { date: '2027-01-04', fractions: ['restavfall', 'matavfall'] },
  ])
  assert.equal(schedule.lastProvidedPickup, '2027-01-04')
})

test('Manual schedule lookup requires exact street, house number and postcode', () => {
  assert.equal(pilotWasteScheduleForAddress('Haldor Flatens veg', '28', '7081'), null)
  assert.equal(pilotWasteScheduleForAddress('Haldor Flatens veg', '27', '7082'), null)
  assert.equal(pilotWasteScheduleForAddress('Unknown street', '27', '7081'), null)
  assert.equal(pilotWasteScheduleForAddress('HALDOR FLATENS VEG', '27', '7081')?.key, 'trondheim-haldor-flatens-veg-27')
})
