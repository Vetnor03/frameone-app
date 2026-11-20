import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeIrnLocations, normalizeIrnPrayerRows, bonnetidLocalToIso } from '../app/lib/integrations/bonnetid/normalize.mjs'

const officialCity = { id: 'NO3201', name: 'Bærum', prayerMethod: 3, asrMethod: '0' }
const officialDay = {
  date: '2026-11-20', location_iso: 'NO3201', prayer_method: 3,
  fajr: '06:11:00', duhr: '12:08:00', asr: '13:46:00', maghrib: '15:44:00', isha: '17:46:00',
}

test('IRN municipality list uses official NO codes and city methods', () => {
  assert.deepEqual(normalizeIrnLocations([
    { location_iso: 'NO0301', location_name: 'Oslo', prayer_method: 3, asr_method: '0' },
    { location_iso: 'NO3201', location_name: 'Bærum', prayer_method: 3, asr_method: '0' },
    { location_iso: 'NO3201', location_name: 'duplicate', prayer_method: 2, asr_method: '2' },
    { location_iso: '120', location_name: 'Legacy', prayer_method: 3 },
    { location_iso: 'NO0000', location_name: 'Unverified', prayer_method: 9 },
  ]), [officialCity, { id: 'NO0301', name: 'Oslo', prayerMethod: 3, asrMethod: '0' }])
})

test('IRN official Nov 20 example yields five prayers with correct Oslo instant', () => {
  const items = normalizeIrnPrayerRows([officialDay], officialCity, ['2026-11-20'])
  assert.deepEqual(items, [
    { date: '2026-11-20', name: 'Fajr', time: '06:11' },
    { date: '2026-11-20', name: 'Dhuhr', time: '12:08' },
    { date: '2026-11-20', name: 'Asr', time: '13:46' },
    { date: '2026-11-20', name: 'Maghrib', time: '15:44' },
    { date: '2026-11-20', name: 'Isha', time: '17:46' },
  ])
  assert.equal(bonnetidLocalToIso('2026-11-20', items[0].time), '2026-11-20T05:11:00.000Z')
})

test('IRN rejects wrong city, wrong method, missing prayer and invalid time rather than guessing', () => {
  const dates = ['2026-11-20']
  assert.deepEqual(normalizeIrnPrayerRows([{ ...officialDay, location_iso: 'NO0301' }], officialCity, dates), [])
  assert.deepEqual(normalizeIrnPrayerRows([{ ...officialDay, prayer_method: 2 }], officialCity, dates), [])
  assert.deepEqual(normalizeIrnPrayerRows([{ ...officialDay, isha: null }], officialCity, dates), [])
  assert.deepEqual(normalizeIrnPrayerRows([{ ...officialDay, fajr: '26:60:00' }], officialCity, dates), [])
  assert.deepEqual(normalizeIrnPrayerRows([{ ...officialDay, date: '2026-11-21' }], officialCity, dates), [])
})

test('IRN results maintain requested day ordering and ignore duplicate rows', () => {
  const later = { ...officialDay, date: '2026-11-21' }
  const items = normalizeIrnPrayerRows([later, officialDay, later], officialCity, ['2026-11-20', '2026-11-21'])
  assert.equal(items.length, 10)
  assert.equal(items[0].date, '2026-11-20')
  assert.equal(items[9].date, '2026-11-21')
})
