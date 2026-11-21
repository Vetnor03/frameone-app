import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const setup = readFileSync(new URL('../app/components/CalendarLinkSetup.tsx', import.meta.url), 'utf8')

test('Calendar Link uses the same Edit and Disconnect actions as other connected apps', () => {
  const start = home.indexOf(") : app.key === 'calendar-link' ? (")
  const end = home.indexOf(") : app.key === 'local-events' ? (", start)
  assert.ok(start >= 0 && end > start)
  const card = home.slice(start, end)
  assert.match(card, /onClick=\{\(\) => setCalendarLinkOpen\(true\)\}/)
  assert.match(card, /language === 'no' \? 'ENDRE' : 'EDIT'/)
  assert.match(card, /setDisconnectConfirmApp\('calendar-link'\)/)
  assert.match(card, /language === 'no' \? 'KOBLE FRA' : 'DISCONNECT'/)
  assert.doesNotMatch(card, /'MANAGE'|'ADMINISTRER'/)
  assert.match(home, /setCalendarLinkFeeds\(\[\]\)/)
  assert.match(home, /disconnectConfirmApp === 'calendar-link'/)
  // During new-frame onboarding, Remove must only opt out of that frame;
  // it must not disconnect an existing account-wide subscription.
  assert.match(home, /const credentialProvider =[^\n]*app.key === 'calendar-link'/)
  assert.match(home, /startup && credentialProvider \? \(/)
})

test('Calendar Link setup closes only after confirmed connection, not on errors or individual removal', () => {
  assert.match(setup, /onConnected: \(\) => void/)
  const connect = setup.slice(setup.indexOf('async function connect()'), setup.indexOf('async function remove(', setup.indexOf('async function connect()')))
  assert.match(connect, /await post\('connect', \{ url, label: calendarName \}\)/)
  assert.match(connect, /await post\('connect'[\s\S]*onChanged\(true\)\s*onConnected\(\)/)
  assert.match(connect, /catch \(e\) \{\s*setError\(/)
  assert.match(home, /onConnected=\{\(\) => setCalendarLinkOpen\(false\)\}/)
  const remove = setup.slice(setup.indexOf('async function remove('), setup.indexOf('  return (', setup.indexOf('async function remove(')))
  assert.match(remove, /await post\('remove', \{ id \}\)/)
  assert.doesNotMatch(remove, /onConnected\(/)
})
