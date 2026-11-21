import test from 'node:test'
import assert from 'node:assert/strict'
import { isPublicIpv4, normalizeCalendarUrl } from '../app/lib/integrations/calendar-link/fetch.mjs'
import { parseCalendarEvents } from '../app/lib/integrations/calendar-link/parse.mjs'

test('accepts secure HTTPS and webcal subscriptions without leaking credentials', () => {
  assert.equal(normalizeCalendarUrl('webcal://example.org/events.ics?key=secret'), 'https://example.org/events.ics?key=secret')
  assert.equal(normalizeCalendarUrl('https://example.org/calendar'), 'https://example.org/calendar')
  for (const url of [
    'http://example.org/feed.ics', 'https://127.0.0.1/a.ics', 'https://localhost/a',
    'https://example.org:444/a', 'https://a:b@example.org/a',
    'file:///etc/passwd', 'https://example.local/a', 'https://example.org/a#fragment',
  ]) assert.throws(() => normalizeCalendarUrl(url))
})

test('blocks private, reserved, multicast and metadata IPs', () => {
  for (const ip of ['127.0.0.1', '10.0.0.4', '172.16.0.1', '192.168.10.1',
    '100.100.100.200', '169.254.169.254', '192.0.2.1', '198.51.100.1',
    '203.0.113.100', '224.0.0.1', '0.0.0.0', '::1']) {
    assert.equal(isPublicIpv4(ip), false, ip)
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '17.253.1.1']) assert.equal(isPublicIpv4(ip), true, ip)
})

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//RE:MIND tests//EN
BEGIN:VEVENT
UID:recur-test@example.org
DTSTAMP:20261121T110000Z
SUMMARY:Training
DTSTART;TZID=Europe/Oslo:20261122T143000
DTEND;TZID=Europe/Oslo:20261122T153000
RRULE:FREQ=WEEKLY;COUNT=3
EXDATE;TZID=Europe/Oslo:20261129T143000
END:VEVENT
BEGIN:VEVENT
UID:recur-test@example.org
RECURRENCE-ID;TZID=Europe/Oslo:20261206T143000
DTSTAMP:20261121T110000Z
SUMMARY:Training moved
DTSTART;TZID=Europe/Oslo:20261206T153000
DTEND;TZID=Europe/Oslo:20261206T163000
END:VEVENT
BEGIN:VEVENT
UID:all-day@example.org
DTSTAMP:20261121T110000Z
SUMMARY:School holiday
DTSTART;VALUE=DATE:20261123
DTEND;VALUE=DATE:20261124
END:VEVENT
BEGIN:VEVENT
UID:cancelled@example.org
DTSTAMP:20261121T110000Z
STATUS:CANCELLED
SUMMARY:Cancelled booking
DTSTART:20261124T130000Z
DTEND:20261124T140000Z
END:VEVENT
END:VCALENDAR
`

test('expands recurring calendar, EXDATE, moved override, all day and cancelled entries', () => {
  const rows = parseCalendarEvents(ICS, 'feed01', 'Family', new Date('2026-11-21T12:00:00Z'))
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map(x => x.title), ['Training', 'School holiday', 'Training moved'])
  assert.equal(rows[0].starts_at, '2026-11-22T13:30:00.000Z')
  assert.equal(rows[1].raw.date, '2026-11-23')
  assert.equal(rows[1].raw.all_day, true)
  assert.equal(rows[2].starts_at, '2026-12-06T14:30:00.000Z')
  assert.ok(rows.every(x => x.raw.feed_id === 'feed01' && !JSON.stringify(x).includes('example.org/events.ics')))
})

test('handles offset change across spring daylight savings', () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dst@example.org
SUMMARY:Morning
DTSTART;TZID=Europe/Oslo:20270327T090000
DTEND;TZID=Europe/Oslo:20270327T100000
RRULE:FREQ=DAILY;COUNT=3
END:VEVENT
END:VCALENDAR`
  const rows = parseCalendarEvents(ics, 'dst', 'Club', new Date('2027-03-26T12:00:00Z'))
  assert.deepEqual(rows.map(x => x.starts_at), [
    '2027-03-27T08:00:00.000Z',
    '2027-03-28T07:00:00.000Z',
    '2027-03-29T07:00:00.000Z',
  ])
})

test('rejects malformed ICS and does not hide errors as empty calendars', () => {
  assert.throws(() => parseCalendarEvents('not an ICS', 'id', 'Club'))
})
