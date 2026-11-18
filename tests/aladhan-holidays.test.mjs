import test from 'node:test'
import assert from 'node:assert/strict'
import { HIJRI_OBSERVANCES, hijriHolidayUrl, hijriYearFromDate, normalizeHijriHoliday, getAladhanHolidayDates } from '../app/lib/integrations/aladhan/holidays.mjs'
import { readFileSync } from 'node:fs'

test('curated Islamic occasions have stable Hijri keys and use provider conversion', () => {
  assert.equal(HIJRI_OBSERVANCES.length, 7)
  assert.equal(hijriYearFromDate('07-06-1448'), 1448)
  assert.equal(hijriYearFromDate('bad-date'), null)
  assert.equal(hijriHolidayUrl(HIJRI_OBSERVANCES[3], 1448), 'https://api.aladhan.com/v1/hToG/01-09-1448')
  const converted = normalizeHijriHoliday({
    code: 200, data: { hijri: { date: '01-09-1448' }, gregorian: { date: '08-02-2027' } },
  }, HIJRI_OBSERVANCES[3], 1448)
  assert.equal(converted.title, 'Ramadan begynner')
  assert.equal(converted.date, '2027-02-08')
  assert.equal(normalizeHijriHoliday({ code: 200, data: { gregorian: { date: '31-02-2027' } } }, HIJRI_OBSERVANCES[3], 1448), null)
  assert.equal(normalizeHijriHoliday({ code: 200, data: { hijri: { date: '02-09-1448' }, gregorian: { date: '08-02-2027' } } }, HIJRI_OBSERVANCES[3], 1448), null)
})

test('calculated upcoming major observances are bounded and missing upstream results are reported', async () => {
  const request = async url => {
    const match = url.match(/(\d{2})-(\d{2})-(\d{4})$/)
    const [ , day, month, year ] = match
    const date = month === '09' ? '08-02-2027' : month === '10' ? '09-03-2027' : '15-12-2026'
    return { ok: true, json: async () => ({ code: 200, data: {
      hijri: { date: day + '-' + month + '-' + year }, gregorian: { date },
    } }) }
  }
  const result = await getAladhanHolidayDates('07-06-1448', '2026-11-18', request)
  assert.equal(result.complete, true)
  assert.ok(result.dates.some(x => x.key === 'ramadan-start' && x.date === '2027-02-08'))
  assert.ok(result.dates.every(x => x.date >= '2026-11-18'))
  const unavailable = await getAladhanHolidayDates('07-06-1448', '2026-11-18', async () => ({ ok: false }))
  assert.equal(unavailable.complete, false)
  assert.deepEqual(unavailable.dates, [])
})

test('prayer and holiday source stay separate, with no solar reminders', () => {
  const backend = readFileSync(new URL('../app/lib/integrations/aladhan/server.ts', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const physical = readFileSync(new URL('../app/lib/device/remindersFeed.ts', import.meta.url), 'utf8')
  const modal = readFileSync(new URL('../app/components/AladhanPreviewModal.tsx', import.meta.url), 'utf8')
  assert.match(backend, /getAladhanHolidayDates/)
  assert.match(backend, /type: 'islamic_holiday'/)
  assert.match(physical, /buildAladhanHolidayItems/)
  assert.match(home, /aladhan-holidays/)
  assert.match(modal, /currentCity && <button/)
  assert.match(modal, /currentCity && advanced &&/)
  assert.match(modal, /\.filter\(item => item\.name !== 'Sunrise' && item\.name !== 'Sunset'\)/)
})
