import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBonnetidLocations, normalizeBonnetidDay, normalizeBonnetidMonth, bonnetidLocalToIso } from '../app/lib/integrations/bonnetid/normalize.mjs'

test('Bønnetid cities come from provider, sorted, with no hardcoded favorites', () => {
  assert.deepEqual(normalizeBonnetidLocations({ results: [{ id: 122, name: 'Stavanger' }, { id: 8, name: 'Oslo' }, { id: 8, name: 'Oslo' }] }),
    [{ id: '8', name: 'Oslo' }, { id: '122', name: 'Stavanger' }])
})

test('full official day produces exactly five prayers and prioritizes 2x Asr', () => {
  const day = normalizeBonnetidDay({ fajr: '05:31:00', duhr: '12:05', asr: '13:00', asr_2x_shadow: '14:00', maghrib: '16:32', isha: '18:00' }, '2026-11-18')
  assert.equal(day.length, 5)
  assert.deepEqual(day.map(item => item.name), ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'])
  assert.equal(day[2].time, '14:00')
  assert.deepEqual(normalizeBonnetidDay({ fajr: 'bad' }, '2026-11-18'), [])
})

test('official month supports daily date fields and keyed date records', () => {
  const template = { fajr: '06:00', duhr: '12:00', asr: '14:00', maghrib: '17:00', isha: '19:00' }
  assert.equal(normalizeBonnetidMonth([{ gregorian_date: 1, ...template }], 2026, 11).length, 5)
  assert.equal(normalizeBonnetidMonth({ '2026-11-02': template }, 2026, 11).length, 5)
})

test('Norway times translate correctly across winter and summer time', () => {
  assert.equal(bonnetidLocalToIso('2026-11-18', '12:00'), '2026-11-18T11:00:00.000Z')
  assert.equal(bonnetidLocalToIso('2026-07-18', '12:00'), '2026-07-18T10:00:00.000Z')
  assert.equal(bonnetidLocalToIso('2026-03-29', '02:30'), null)
})
