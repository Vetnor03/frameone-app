import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeIrnMonthStarts, normalizeIrnMonthLabels, normalizeIrnAnnualEvents, buildIrnCalendarOccurrences,
} from '../app/lib/integrations/bonnetid/calendar.mjs'

const months = Array.from({ length: 12 }, (_, i) => ({
  hijri_date_month: i + 1, no: 'NO month ' + (i + 1), en: 'EN month ' + (i + 1), ar: 'AR month ' + (i + 1),
}))
months[8] = { ...months[8], no: '01. Ramadan – Den niende måned (Fastemåneden)' }
months[9] = { ...months[9], no: '01. Shawwal - Den tiende måned - (Eid ul-Fitr)' }
const events = [{ hijri_date_month: 9, hijri_date_day: 27, no: '27. Ramadan – Laylat-ul-Qadr (Skjebnenatten)', en: '27. Ramadan – Laylat-ul-Qadr (Night of Decree)', ar: '٢٧. رمضان – ليلة القدر' }]
const mapping = [
  { hijri_date_day: 1, hijri_date_month: 9, hijri_date_year: 1442, gregorian_date: '2021-04-13' },
  { hijri_date_day: 1, hijri_date_month: 10, hijri_date_year: 1442, gregorian_date: '2021-05-13' },
  { hijri_date_day: 1, hijri_date_month: 11, hijri_date_year: 1442, gregorian_date: '2021-06-11' },
]

test('IRN labels preserve exact Norwegian, English, and Arabic strings', () => {
  assert.equal(normalizeIrnMonthLabels(months)[9].no, '01. Shawwal - Den tiende måned - (Eid ul-Fitr)')
  assert.equal(normalizeIrnAnnualEvents(events)[0].ar, events[0].ar)
  assert.equal(normalizeIrnMonthLabels(months).length, 12)
})

test('IRN official month starts produce exact all-day Ramadan, Laylat-ul-Qadr and Eid ul-Fitr dates', () => {
  const actual = buildIrnCalendarOccurrences({ mapping, months, events, today: '2021-04-01', horizonEnd: '2021-06-30' })
  assert.deepEqual(actual.map(item => [item.date, item.kind, item.no]), [
    ['2021-04-13', 'month_start', months[8].no],
    ['2021-05-09', 'annual_event', events[0].no],
    ['2021-05-13', 'month_start', months[9].no],
  ])
  assert.equal(actual.find(item => item.kind === 'annual_event').en, events[0].en)
})

test('IRN never guesses dates without the next consecutive month boundary', () => {
  assert.deepEqual(buildIrnCalendarOccurrences({
    mapping: mapping.slice(0, 1), months, events, today: '2021-04-01', horizonEnd: '2021-06-30',
  }), [])
  assert.deepEqual(buildIrnCalendarOccurrences({
    mapping: [mapping[0], mapping[2]], months, events, today: '2021-04-01', horizonEnd: '2021-06-30',
  }), [])
  assert.deepEqual(buildIrnCalendarOccurrences({
    mapping: [{ ...mapping[0], gregorian_date: '2021-04-99' }, mapping[1]], months, events,
    today: '2021-04-01', horizonEnd: '2021-06-30',
  }), [])
})

test('IRN only accepts day-one mapping and avoids duplicate month starts', () => {
  const a = normalizeIrnMonthStarts([...mapping, { ...mapping[0] }, { ...mapping[1], hijri_date_day: 2 }])
  assert.equal(a.length, 3)
  assert.equal(a[0].date, '2021-04-13')
})

test('IRN handles Hijri year rollover without inventing the next month', () => {
  const local = [
    { hijri_date_day: 1, hijri_date_month: 12, hijri_date_year: 1447, gregorian_date: '2026-05-18' },
    { hijri_date_day: 1, hijri_date_month: 1, hijri_date_year: 1448, gregorian_date: '2026-06-16' },
    { hijri_date_day: 1, hijri_date_month: 2, hijri_date_year: 1448, gregorian_date: '2026-07-16' },
  ]
  const actual = buildIrnCalendarOccurrences({ mapping: local, months, events, today: '2026-05-18', horizonEnd: '2026-07-30' })
  assert.deepEqual(actual.map(item => item.date), ['2026-05-18', '2026-06-16'])
})

test('IRN rejects invalid or incomplete provider language data', () => {
  assert.equal(normalizeIrnMonthLabels([...months.slice(0, 11), { ...months[11], en: '' }]).length, 11)
  assert.deepEqual(buildIrnCalendarOccurrences({
    mapping, months: months.slice(0, 11), events, today: '2021-04-01', horizonEnd: '2021-06-30',
  }), [])
})
