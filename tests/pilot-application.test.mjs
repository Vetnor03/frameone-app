import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const page = readFileSync(new URL('../app/pilot/PilotApplication.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/pilot/applications/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260929133330_pilot_applications_private.sql', import.meta.url), 'utf8')
const publicPage = readFileSync(new URL('../app/pilot/page.tsx', import.meta.url), 'utf8')
const selectedPage = readFileSync(new URL('../app/pilot/selected/page.tsx', import.meta.url), 'utf8')

test('public pilot is an application, while selected configurator is preserved', () => {
  assert.match(publicPage, /PilotApplication/)
  assert.match(selectedPage, /PilotConfigurator/)
  assert.match(selectedPage, /index: false/)
})

test('the application accurately discloses prototype, return, feedback and discount', () => {
  for (const term of ['ikke CE-merket', 'tre uker', '50 %', 'returneres', 'feedbackAcknowledged']) {
    assert.ok(page.includes(term), term)
  }
  assert.match(page, /Leveringsadresse spør vi først/)
  assert.match(page, /Ingen enheter sendes ut før testopplegget er avklart/)
})

test('the application API validates acknowledgements and does not expose duplicate emails', () => {
  for (const name of ['prototypeAcknowledged', 'returnAcknowledged', 'feedbackAcknowledged']) {
    assert.match(route, new RegExp('body\\.' + name + ' !== true'))
  }
  assert.doesNotMatch(route, /body\\.ageConfirmed !== true/)
  assert.match(route, /follow_up_interview_opt_in: body\\.followUpInterviewOptIn === true/)
  assert.match(route, /error\\.code !== '23505'/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/)
})

test('private applicant table has RLS and no anon or authenticated grants', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.pilot_applications from public, anon, authenticated/)
  assert.match(migration, /grant all on table public\.pilot_applications to service_role/)
})

test('the new headline and checkbox requirements match the server contract', () => {
  assert.match(page, /Vil du bli den første til å teste RE:MIND\?/)
  assert.doesNotMatch(page, /name="ageConfirmed"/)
  for (const name of ['prototypeAcknowledged', 'returnAcknowledged', 'feedbackAcknowledged']) {
    assert.match(page, new RegExp('name="' + name + '" required'))
  }
  assert.match(page, /name="followUpInterviewOptIn" className/)
  assert.match(page, /Valgfritt/)
  assert.match(page, /Må godtas for å sende inn/)
})

test('new migration preserves historic age data and provides optional follow-up storage', () => {
  const followUpMigration = readFileSync(new URL('../supabase/migrations/20260929134451_pilot_optional_followup_and_later_age_check.sql', import.meta.url), 'utf8')
  assert.match(followUpMigration, /age_confirmed drop not null/)
  assert.match(followUpMigration, /follow_up_interview_opt_in boolean not null default false/)
  assert.doesNotMatch(followUpMigration, /drop column age_confirmed/)
})
