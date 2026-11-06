import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('pilot selection confirmation uses the real photographed combination with safe HTML', () => {
  const email = read('app/lib/pilotSelectionConfirmationEmail.ts')
  assert.match(email, /pilotCombinationPhoto\(frameId, matteId\)/)
  assert.match(email, /new URL\(photoPath, 'https:\/\/re-mind.no'\)/)
  assert.match(email, /escapeHtml\(frameName/)
  assert.match(email, /escapeHtml\(matteName/)
  assert.match(email, /escapeHtml\(photoUrl\)/)
  assert.match(email, /\[TEST\]/)
  assert.match(email, /RE:MIND – rammevalget ditt er registrert/)
  assert.match(email, /idempotencyKey/)
})

test('private email test cannot send from production or to an arbitrary address', () => {
  const api = read('app/api/pilot/test-selection-email/route.ts')
  assert.match(api, /process\.env\.VERCEL_ENV !== 'preview'/)
  assert.match(api, /Date\.now\(\) >= EXPIRES_AT/)
  assert.match(api, /PILOT_SELECTION_EMAIL_TEST_SECRET/)
  assert.match(api, /timingSafeEqual/)
  assert.match(api, /validPilotFrame\(body\.frameId\)/)
  assert.match(api, /validSelectablePilotMatte\(body\.matteId\)/)
  assert.match(api, /const TEST_RECIPIENT = 'vetlecn@live.no'/)
  assert.doesNotMatch(api, /email:\s*body\./)
})

test('demo can send the preview email but never creates a pilot order', () => {
  const ui = read('app/pilot/PilotConfigurator.tsx')
  const page = read('app/pilot/selected/page.tsx')
  assert.match(ui, /demoMode && testKey/)
  assert.match(ui, /fetch\('\/api\/pilot\/test-selection-email'/)
  assert.match(ui, /No pilot order has been created or changed/)
  assert.match(page, /test_key/)
})
