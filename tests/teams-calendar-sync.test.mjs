import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { fetchMicrosoftCalendarView } from '../app/lib/integrations/teams/client.ts'

test('Teams sync defaults to a forward calendar horizon and the app refreshes before reading cached events', () => {
  const server = readFileSync(new URL('../app/lib/integrations/teams/server.ts', import.meta.url), 'utf8')
  const homePage = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const syncRoute = readFileSync(new URL('../app/api/integrations/teams/sync/route.ts', import.meta.url), 'utf8')

  assert.match(server, /DEFAULT_TEAMS_CALENDAR_HORIZON_DAYS = 120/)
  assert.match(server, /options\.horizonDays \?\? DEFAULT_TEAMS_CALENDAR_HORIZON_DAYS/)
  assert.match(homePage, /fetch\('\/api\/integrations\/teams\/sync'/)
  assert.match(syncRoute, /horizonDays: DEFAULT_TEAMS_CALENDAR_HORIZON_DAYS/)
})

test('Microsoft calendar view follows Graph pagination so later meetings are not dropped', async () => {
  const originalFetch = globalThis.fetch
  const calls = []

  try {
    globalThis.fetch = async (input) => {
      const url = String(input)
      calls.push(url)

      if (calls.length === 1) {
        return new Response(JSON.stringify({
          value: [{
            id: 'later',
            subject: 'Later meeting',
            start: { dateTime: '2026-09-25T10:00:00', timeZone: 'UTC' },
            end: { dateTime: '2026-09-25T11:00:00', timeZone: 'UTC' },
          }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendarView?page=2',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        value: [{
          id: 'earlier',
          subject: 'Earlier meeting',
          start: { dateTime: '2026-09-24T09:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-09-24T10:00:00', timeZone: 'UTC' },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const meetings = await fetchMicrosoftCalendarView(
      'token',
      '2026-09-24T00:00:00.000Z',
      '2027-01-23T00:00:00.000Z'
    )

    assert.equal(calls.length, 2)
    assert.equal(calls[1], 'https://graph.microsoft.com/v1.0/me/calendarView?page=2')
    assert.deepEqual(meetings.map((meeting) => meeting.id), ['earlier', 'later'])
  } finally {
    globalThis.fetch = originalFetch
  }
})
