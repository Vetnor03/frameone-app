import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fetchMicrosoftCalendars, fetchSelectedMicrosoftCalendarEvents } from '../app/lib/integrations/teams/client.ts'

test('Outlook lists paginated calendars and identifies the primary calendar', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async input => {
      const url = String(input)
      if (url.includes('page=2')) return Response.json({value: [{id: 'family', name: 'Family'}]})
      if (url.includes('/me/calendars')) return Response.json({value: [{id: 'work', name: 'Work'}], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?page=2'})
      return Response.json({id: 'work', name: 'Work'})
    }
    assert.deepEqual(await fetchMicrosoftCalendars('token'), [
      {id: 'work', name: 'Work', isDefaultCalendar: true},
      {id: 'family', name: 'Family', isDefaultCalendar: false},
    ])
  } finally { globalThis.fetch = original }
})

test('selected calendar sync reads only chosen calendars and preserves legacy default', async () => {
  const original = globalThis.fetch
  const paths = []
  try {
    globalThis.fetch = async input => {
      const path = new URL(String(input)).pathname
      paths.push(path)
      return Response.json({value: [{id: path, subject: 'Appointment', start: {dateTime: '2026-12-01T10:00:00'}, end: {dateTime: '2026-12-01T11:00:00'}}]})
    }
    const start = '2026-11-24T00:00:00Z', end = '2027-03-24T00:00:00Z'
    assert.equal((await fetchSelectedMicrosoftCalendarEvents('token', start, end, ['work', 'family', 'work'])).length, 2)
    assert.deepEqual(paths, ['/v1.0/me/calendars/work/calendarView', '/v1.0/me/calendars/family/calendarView'])
    await fetchSelectedMicrosoftCalendarEvents('token', start, end)
    assert.equal(paths.at(-1), '/v1.0/me/calendarView')
  } finally { globalThis.fetch = original }
})

test('calendar selection sync fails rather than silently returning a partial cache', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async input => String(input).includes('/family/') ? Response.json({error: {message: 'Denied'}}, {status: 403}) : Response.json({value: []})
    await assert.rejects(fetchSelectedMicrosoftCalendarEvents('token', '2026-11-24', '2027-03-24', ['work', 'family']), /Denied/)
  } finally { globalThis.fetch = original }
})

test('selection uses authenticated server storage and existing provider identity', () => {
  const source = readFileSync(new URL('../app/lib/integrations/teams/server.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/integrations/teams/calendars/route.ts', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(source, /TEAMS_PROVIDER = 'teams'/)
  assert.ok(source.includes('credentials.calendar_ids'))
  assert.ok(source.includes('calendar_ids: selectedIds'))
  assert.ok(route.includes('getAuthenticatedUserId(req)'))
  assert.ok(ui.includes('checked={selected.includes(calendar.id)}'))
  assert.ok(ui.includes('setOutlookCalendarOpen(true)'))
})
