import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const appDir = fileURLToPath(new URL('../app/', import.meta.url))
const contactModule = readFileSync(new URL('../app/lib/contactEmail.ts', import.meta.url), 'utf8')

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(path)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) yield path
  }
}

test('pilot contact email has one shared definition and no stale app-wide addresses', () => {
  assert.match(contactModule, /export const CONTACT_EMAIL = 'vetlecn@live\.no'/)
  for (const path of sourceFiles(appDir)) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /support@re-mind\.no/, path)
    if (!path.endsWith('contactEmail.ts')) {
      assert.doesNotMatch(source, /vetlecn@live\.no/, path)
    }
  }
})

test('transactional messages retain the verified sender and use the shared reply-to', () => {
  const mailer = readFileSync(new URL('../app/lib/pilotApplicationEmail.ts', import.meta.url), 'utf8')
  const integration = readFileSync(new URL('../app/lib/integrations/requestNotification.ts', import.meta.url), 'utf8')
  const waitlist = readFileSync(new URL('../app/lib/waitlistEmail.ts', import.meta.url), 'utf8')
  assert.match(mailer, /RE:MIND <login@re-mind\.no>/)
  assert.match(mailer, /PILOT_REPLY_TO = CONTACT_EMAIL/)
  assert.match(integration, /const recipient = CONTACT_EMAIL/)
  assert.match(waitlist, /const notifyEmail = CONTACT_EMAIL/)
})
