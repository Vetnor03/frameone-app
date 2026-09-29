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
  for (const term of ['ikke CE-merket', 'tre uker', '50 %', 'returneres', 'pilotContactAcknowledged']) {
    assert.ok(page.includes(term), term)
  }
  assert.match(page, /Leveringsadresse spør vi først/)
  assert.match(page, /Ingen enheter sendes ut før testopplegget er avklart/)
})

test('the application API validates acknowledgements and does not expose duplicate emails', () => {
  for (const name of ['prototypeAcknowledged', 'returnAcknowledged', 'pilotContactAcknowledged']) {
    assert.match(route, new RegExp('body\\.' + name + ' !== true'))
  }
  assert.doesNotMatch(route, /ageConfirmed !== true/)
  assert.match(route, /pilot_contact_acknowledged_at: acknowledgedAt/)
  assert.match(route, /terms_version: '2026-09-29-v3'/)
  assert.doesNotMatch(route, /followUpInterviewOptIn/)
  assert.ok(route.includes("error.code !== '23505'"))
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
  for (const name of ['prototypeAcknowledged', 'returnAcknowledged', 'pilotContactAcknowledged']) {
    assert.match(page, new RegExp('name="' + name + '" required'))
  }
  assert.doesNotMatch(page, /name="followUpInterviewOptIn"/)
  assert.doesNotMatch(page, />Valgfritt<\/p>/)
  assert.match(page, /mailto:vetlecn@live\.no/)
  assert.match(page, /kontakter meg på e-post underveis og etter testperioden/)
  assert.match(page, /Må godtas for å sende inn/)
})

test('new migration preserves historic age data and provides optional follow-up storage', () => {
  const followUpMigration = readFileSync(new URL('../supabase/migrations/20260929134451_pilot_optional_followup_and_later_age_check.sql', import.meta.url), 'utf8')
  assert.match(followUpMigration, /age_confirmed drop not null/)
  assert.match(followUpMigration, /follow_up_interview_opt_in boolean not null default false/)
  assert.doesNotMatch(followUpMigration, /drop column age_confirmed/)
})


test('explicit pilot contact consent is stored separately without inferring it for prior applicants', () => {
  const contactMigration = readFileSync(new URL('../supabase/migrations/20260929144909_pilot_required_contact_acknowledgement.sql', import.meta.url), 'utf8')
  assert.match(contactMigration, /add column if not exists pilot_contact_acknowledged_at timestamptz/)
  assert.doesNotMatch(contactMigration, /pilot_contact_acknowledged_at timestamptz not null/)
  assert.doesNotMatch(contactMigration, /update public\.pilot_applications/)
  assert.match(page, /name="pilotContactAcknowledged" required/)
  assert.match(route, /body\.pilotContactAcknowledged !== true/)
})


test('pilot deadline is the end of 1 November in Oslo and is server-enforced', () => {
  const deadline = readFileSync(new URL('../app/lib/pilotApplicationDeadline.ts', import.meta.url), 'utf8')
  const match = deadline.match(/PILOT_CLOSES_AT_UTC = '([^']+)'/)
  assert.ok(match, 'deadline has a shared UTC instant')
  const close = Date.parse(match[1])
  assert.equal(close, Date.parse('2026-11-01T23:00:00.000Z'))
  assert.ok(Date.parse('2026-11-01T22:59:59.999Z') < close)
  assert.ok(Date.parse('2026-11-01T23:00:00.000Z') >= close)
  assert.ok(deadline.includes('1. november 2026 kl. 23.59'))
  assert.match(publicPage, /force-dynamic/)
  assert.ok(publicPage.includes('isPilotApplicationClosed()'))
  assert.ok(publicPage.includes('Påmeldingen er avsluttet'))
  assert.ok(page.includes('PILOT_DEADLINE_LABEL'))
  assert.ok(route.includes('status: 410'))
  assert.equal(route.split('isPilotApplicationClosed()').length - 1, 2)
})

test('confirmation mail is sent only after a successful database insert and tracked privately', () => {
  const mailer = readFileSync(new URL('../app/lib/pilotApplicationEmail.ts', import.meta.url), 'utf8')
  const emailStatusMigration = readFileSync(new URL('../supabase/migrations/20260929150853_pilot_confirmation_email_status.sql', import.meta.url), 'utf8')
  assert.ok(mailer.includes('PILOT_DEADLINE_LABEL'))
  assert.ok(mailer.includes('Du hører fra oss når vi nærmer oss pilottesten'))
  assert.ok(mailer.includes('RE:MIND <login@re-mind.no>'))
  assert.ok(mailer.includes("PILOT_REPLY_TO = 'vetlecn@live.no'"))
  assert.ok(mailer.includes('RESEND_API_KEY'))
  assert.ok(route.includes('if (!error && data)'))
  assert.ok(route.includes('sendPilotApplicationConfirmation'))
  assert.ok(route.includes('confirmation_email_sent_at'))
  assert.ok(route.includes('confirmation_email_resend_id'))
  assert.ok(emailStatusMigration.includes('confirmation_email_sent_at timestamptz'))
  assert.ok(emailStatusMigration.includes('confirmation_email_resend_id text'))
  assert.ok(!page.includes('Tilbake til RE:MIND'))
  assert.ok(page.includes('påmeldingen likevel registrert'))
  assert.ok(route.includes('Same public response for new and existing emails'))
})

test('Annet shows a required conditional explanation and sends it with the application', () => {
  assert.match(page, /const \[useCase, setUseCase\] = useState\(''\)/)
  assert.match(page, /name="useCase" required value=\{useCase\} onChange=/)
  assert.match(page, /\{useCase === 'other' \? \(/)
  assert.match(page, /name="useCaseOther" required maxLength=\{300\}/)
  assert.match(page, /useCaseOther: useCase === 'other' \? String\(form\.get\('useCaseOther'\) \|\| ''\) : ''/)
})

test('the server rejects blank Annet explanations and stores only genuine Annet text', () => {
  assert.match(route, /const useCaseOther = field\(body\.useCaseOther, 300\)/)
  assert.match(route, /\(useCase === 'other' && !useCaseOther\)/)
  assert.match(route, /use_case_other: useCase === 'other' \? useCaseOther : null/)
  const otherMigration = readFileSync(new URL('../supabase/migrations/20260929153605_pilot_other_use_case_description.sql', import.meta.url), 'utf8')
  assert.match(otherMigration, /add column if not exists use_case_other text/)
  assert.doesNotMatch(otherMigration, /update public\.pilot_applications/)
})

test('one email can create only one pilot application, regardless of capitalization or whitespace', () => {
  const uniqueMigration = readFileSync(new URL('../supabase/migrations/20260929163805_pilot_email_normalized_uniqueness.sql', import.meta.url), 'utf8')
  assert.match(uniqueMigration, /create unique index if not exists pilot_applications_email_normalized_unique_idx/)
  assert.match(uniqueMigration, /lower\(btrim\(email\)\)/)
  assert.match(route, /field\(body\.email, 200\)\?\.toLowerCase\(\)/)
  assert.match(route, /error\.code !== '23505'/)
  assert.match(route, /if \(!error && data\) \{/)
  assert.match(route, /sendPilotApplicationConfirmation/)
  assert.match(route, /Same public response for new and existing emails/)
})
