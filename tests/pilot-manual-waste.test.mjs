import test from 'node:test'
import assert from 'node:assert/strict'
import { PILOT_WASTE_SCHEDULES, pilotWasteScheduleForAddress } from '../app/lib/integrations/waste/pilotManualSchedules.ts'

test('Trondheim pilot schedule uses only the six exact dates and fractions supplied by Trondheim Renholdsverk', () => {
  const schedule = pilotWasteScheduleForAddress('Haldor Flatens veg', '27', '7081')
  assert.ok(schedule)
  assert.equal(PILOT_WASTE_SCHEDULES.length, 2)
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

test('Fredrikstad pilot pickup data matches the photographed November–December 2026 timetable', () => {
  const schedule = pilotWasteScheduleForAddress('Rødsmyraskogen', '21', '1671')
  assert.ok(schedule)
  assert.equal(schedule.source.includes('Fredrikstad kommune'), true)
  assert.equal(schedule.lastProvidedPickup, '2026-12-23')
  assert.deepEqual(schedule.pickups, [
    { date: '2026-11-04', fractions: ['restavfall'] },
    { date: '2026-11-09', fractions: ['papir', 'plast'] },
    { date: '2026-11-10', fractions: ['hazardous'], starred: true },
    { date: '2026-11-11', fractions: ['matavfall'] },
    { date: '2026-11-18', fractions: ['restavfall'] },
    { date: '2026-11-24', fractions: ['hazardous'], starred: true },
    { date: '2026-11-25', fractions: ['matavfall'] },
    { date: '2026-12-02', fractions: ['restavfall'] },
    { date: '2026-12-07', fractions: ['papir', 'plast', 'glass_metall'] },
    { date: '2026-12-08', fractions: ['hazardous'], starred: true },
    { date: '2026-12-09', fractions: ['matavfall'] },
    { date: '2026-12-16', fractions: ['restavfall'] },
    { date: '2026-12-23', fractions: ['matavfall'] },
  ])
})

test('Fredrikstad manual calendar cannot match another address', () => {
  assert.equal(pilotWasteScheduleForAddress('Rødsmyraskogen', '22', '1671'), null)
  assert.equal(pilotWasteScheduleForAddress('Rødsmyraskogen', '21', '1672'), null)
  assert.equal(pilotWasteScheduleForAddress('RØDSMYRASKOGEN', '21', '1671')?.key, 'fredrikstad-rodsmyraskogen-21')
})
