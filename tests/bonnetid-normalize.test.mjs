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

test('Asr method selection chooses the official matching shadow field, not the other method', () => {
  const response = {
    fajr: '05:31', shuruq_sunrise: '07:43', duhr: '12:05',
    asr_1x_shadow: '13:15', asr_2x_shadow: '14:00',
    maghrib: '16:32', isha: '18:00'
  }
  const once = normalizeBonnetidDay(response, '2026-11-18', 1)
  const twice = normalizeBonnetidDay(response, '2026-11-18', 2)
  assert.equal(once.find(item => item.name === 'Asr')?.time, '13:15')
  assert.equal(twice.find(item => item.name === 'Asr')?.time, '14:00')
  assert.equal(once.find(item => item.name === 'Soloppgang')?.time, '07:43')
  assert.equal(once.length, 6)
  assert.equal(normalizeBonnetidDay({ ...response, asr_1x_shadow: undefined }, '2026-11-18', 1).length, 0)
})

test('Maghrib represents sunset without a duplicate, distinct official sunset is displayed', () => {
  const day = { fajr: '05:31', duhr: '12:05', asr_1x_shadow: '13:15', asr_2x_shadow: '14:00', maghrib: '16:32', isha: '18:00' }
  assert.equal(normalizeBonnetidDay({ ...day, sunset: '16:32' }, '2026-11-18').filter(item => item.name === 'Solnedgang').length, 0)
  assert.equal(normalizeBonnetidDay({ ...day, sunset: '16:31' }, '2026-11-18').find(item => item.name === 'Solnedgang')?.time, '16:31')
})
