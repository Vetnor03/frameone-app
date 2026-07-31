import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('legal pages contain localized sensitive-information guidance and current dates', () => {
  const terms = read('app/terms/page.tsx')
  const privacy = read('app/privacy/page.tsx')

  assert.match(terms, /title: 'USER CONTENT AND SENSITIVE INFORMATION'/)
  assert.match(terms, /title: 'BRUKERINNHOLD OG SENSITIVE OPPLYSNINGER'/)
  assert.match(terms, /Nothing in these terms limits any rights or liability that cannot lawfully be excluded/)
  assert.match(terms, /Ingenting i disse vilkårene begrenser rettigheter eller ansvar som ikke lovlig kan fravikes/)
  assert.match(terms, /Last updated: July 31, 2026/)
  assert.match(terms, /Sist oppdatert: 31\. juli 2026/)

  assert.match(privacy, /title: 'USER-CREATED CONTENT'/)
  assert.match(privacy, /title: 'INNHOLD DU OPPRETTER'/)
  assert.match(privacy, /title: 'EXTERNAL AI PROCESSING FOR AI FOLLOW'/)
  assert.match(privacy, /title: 'EKSTERN KI-BEHANDLING FOR AI FOLLOW'/)
  assert.match(privacy, /Last updated: July 31, 2026/)
  assert.match(privacy, /Sist oppdatert: 31\. juli 2026/)
})

test('one localized helper is reused for user-created free text', () => {
  const helper = read('app/components/SensitiveInformationHelper.tsx')
  const assistant = read('app/components/AIAssistantTab.tsx')
  const app = read('app/HomePageClient.tsx')

  assert.match(helper, /Do not enter passwords, payment information, national identification numbers, health information/)
  assert.match(helper, /Ikke legg inn passord, betalingsinformasjon, fødselsnummer, helseopplysninger/)
  assert.equal((assistant.match(/<SensitiveInformationHelper language=\{language\} \/>/g) ?? []).length, 2)
  assert.equal((app.match(/<SensitiveInformationHelper language=\{language\} \/>/g) ?? []).length, 3)
})
