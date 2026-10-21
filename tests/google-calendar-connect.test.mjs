import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fetchGoogleCalendars, fetchGoogleEvents, googleCalendarAuthUrl, normalizeGoogleEvent } from '../app/lib/integrations/google-calendar/client.ts'

test('Google OAuth requests offline read-only access with PKCE state', () => {
  const old = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const oldRedirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI
  try {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client'
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://re-mind.no/api/integrations/google-calendar/callback'
    const url = new URL(googleCalendarAuthUrl('opaque-state', 'challenge'))
    assert.equal(url.searchParams.get('access_type'), 'offline')
    assert.deepEqual(url.searchParams.get('scope')?.split(' '), [
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ])
    assert.equal(url.searchParams.get('prompt'), 'consent select_account')
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(url.searchParams.get('state'), 'opaque-state')
  } finally {
    if (old === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = old
    if (oldRedirect === undefined) delete process.env.GOOGLE_CALENDAR_REDIRECT_URI
    else process.env.GOOGLE_CALENDAR_REDIRECT_URI = oldRedirect
  }
})

test('Google all-day, timed, declined and cancelled event normalization', () => {
  const calendar = { id: 'home@example.com', summary: 'Family', selected: true }
  const allDay = normalizeGoogleEvent({ id: 'birthday', summary: 'Birthday', start: { date: '2026-10-25' } }, calendar)
  assert.equal(allDay?.date, '2026-10-25')
  assert.equal(allDay?.all_day, true)
  assert.equal(allDay?.id, 'home@example.com:birthday')
  const timed = normalizeGoogleEvent({ id: 'meeting', summary: 'Dentist', start: { dateTime: '2026-10-25T09:00:00+01:00' } }, calendar)
  assert.equal(timed?.starts_at, '2026-10-25T08:00:00.000Z')
  assert.equal(normalizeGoogleEvent({ id: 'deleted', status: 'cancelled' }, calendar), null)
  assert.equal(normalizeGoogleEvent({ id: 'declined', attendees: [{ self: true, responseStatus: 'declined' }] }, calendar), null)
})

test('Selected calendar filtering and paginated event import', async () => {
  const originalFetch = globalThis.fetch
  const seen = []
  try {
    globalThis.fetch = async (request) => {
      const url = new URL(String(request))
      seen.push(url.toString())
      if (url.pathname.endsWith('/calendarList')) {
        return new Response(JSON.stringify({ items: [
          { id: 'main@example.com', summary: 'Main', primary: true },
          { id: 'hidden@example.com', hidden: true },
          { id: 'other@example.com', selected: true, summary: 'Shared' },
        ] }), { status: 200 })
      }
      if (url.searchParams.has('pageToken')) {
        return new Response(JSON.stringify({ items: [{ id: 'second', summary: 'Later', start: { date: '2026-10-27' } }] }), { status: 200 })
      }
      return new Response(JSON.stringify({ items: [{ id: 'first', summary: 'Soon', start: { dateTime: '2026-10-24T10:00:00Z' } }], nextPageToken: 'more' }), { status: 200 })
    }
    const calendars = await fetchGoogleCalendars('token')
    assert.deepEqual(calendars.map(c => c.id), ['main@example.com', 'other@example.com'])
    const events = await fetchGoogleEvents('token', calendars, '2026-10-19T00:00:00Z', '2027-02-19T00:00:00Z')
    assert.equal(events.length, 4)
    assert.equal(events[0].title, 'Soon')
    assert.ok(seen.some(url => url.includes('singleEvents=true')))
    assert.ok(seen.some(url => url.includes('pageToken=more')))
  } finally { globalThis.fetch = originalFetch }
})

test('Google Calendar is wired to phone, Connect and frame Reminders', () => {
  const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const physical = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  const catalogue = readFileSync(new URL('../app/lib/integrations/catalog.ts', import.meta.url), 'utf8')
  assert.match(catalogue, /key: 'google-calendar'/)
  assert.match(app, /\/api\/integrations\/google-calendar\/connect/)
  assert.match(app, /'google-calendar', 'waste', 'edge-of-norway'/)
  assert.match(physical, /buildGoogleCalendarItems/)
  assert.match(physical, /syncGoogleCalendarFromStoredConnection/)
})
