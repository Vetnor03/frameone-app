import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectAiAssistantFrameItems } from '../app/lib/device/aiAssistantFrame.ts'
import { simplifyAiAssistantTopicTitle } from '../app/lib/device/aiAssistantTopicTitle.ts'

const route = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const interpreter = readFileSync(new URL('../supabase/functions/interpret-ai-assistant/index.ts', import.meta.url), 'utf8')
const topicHelper = readFileSync(new URL('../app/lib/device/aiAssistantTopicTitle.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260714233000_reinterpret_invalid_ai_assistant_topic_titles.sql', import.meta.url), 'utf8')

function row(id, extra = {}) {
  return {
    id,
    headline: 'Arrangementer i Stavanger helgen 18.–19. juli',
    summary: 'Lørdag er det moteshow kl. 18. Søndag arrangeres fotballfest kl. 17.',
    is_read: false,
    dismissed_from_frame: false,
    created_at: '2026-07-14T11:00:00.000Z',
    monitoring_watches: { owner_user_id: 'member-a', title: 'Stavanger', preferred_language: 'no' },
    ...extra,
  }
}

const options = { memberUserIds: ['member-a'], now: new Date('2026-07-14T12:00:00.000Z'), limit: 2 }

test('displayed update uses its Watch topic as the shared header field', () => {
  const selected = selectAiAssistantFrameItems([row('stavanger')], options)
  assert.equal(selected.items[0].topicTitle, 'STAVANGER')
  assert.match(route, /aiAssistantTopicTitle: frameItems\[0\]\?\.topicTitle \|\| activeTopicTitle/)
  assert.match(home, /const header = items\[0\]\?\.topicTitle \|\| mirrorAiAssistantEmptyHeader/)
})

test('valid short titles remain unchanged', () => {
  assert.equal(simplifyAiAssistantTopicTitle('Coldplay', 'no'), 'COLDPLAY')
  assert.equal(simplifyAiAssistantTopicTitle('Surfutstyr', 'no'), 'SURFUTSTYR')
})

test('invalid existing titles fall back instead of being derived in renderers', () => {
  const title = 'Skjer det noe kjekt i Stavanger til helgen?'
  assert.equal(simplifyAiAssistantTopicTitle(title, 'no'), 'OPPDATERING')
  assert.notEqual(simplifyAiAssistantTopicTitle(title, 'no'), title.toUpperCase())
})

test('original request never reaches frame rendering', () => {
  const selected = selectAiAssistantFrameItems([row('private', { original_request: 'Gi beskjed om salg på våtdrakter og surfebrett' })], options)
  assert.doesNotMatch(JSON.stringify(selected.items[0]), /original_request|Gi beskjed/)
  assert.doesNotMatch(route, /original_request|trigger_description/)
})

test('update headline is not reused as topic header', () => {
  const selected = selectAiAssistantFrameItems([row('headline-check')], options)
  assert.equal(selected.items[0].topicTitle, 'STAVANGER')
  assert.notEqual(selected.items[0].topicTitle, selected.items[0].headline.toUpperCase())
})

test('Mirror View and physical frame use the same snapshot field', () => {
  assert.match(route, /aiAssistantTopicTitle/)
  assert.match(home, /detail\.aiAssistantTopicTitle/)
  assert.match(home, /MirrorModuleHeader title=\{header\} className="mx-auto"/)
})

test('empty state headers use NOTHING NEW or INGENTING NYTT, and zero RE:MIND', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /if \(count <= 0\) return 'RE:MIND'/)
  assert.match(renderer, /return aiAssistantNoUpdatesHeader\(language\)/)
  assert.match(topicHelper, /INGENTING NYTT|NOTHING NEW/)
})

test('topic title interpretation rules are implemented without reducing detailed monitoring fields', () => {
  for (const phrase of ['proper short topic header', 'never more than three words', 'Explicitly reject titles such as Hva', 'Never expose the complete original request in title', 'Keep original_request unchanged', 'normalized_goal, trigger_description, and search_guidance']) assert.match(interpreter, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('GPT interpretation produces Stavanger not Hva and rejects question or instruction words', () => {
  assert.match(interpreter, /Hva skjer i Stavanger denne helgen\?" -> "Stavanger"/)
  for (const word of ['Hva','Hvor','Når','Hvordan','What','Where','When','Find','Follow','Update','News','Assistant']) assert.match(interpreter, new RegExp(word))
  assert.match(interpreter, /words\.length > 3/)
})

test('question and instruction words cannot render as topic titles and titles are at most three words', () => {
  for (const bad of ['Hva', 'Where', 'Find', 'Follow', 'Update', 'News', 'Assistant', 'Hva?']) assert.equal(simplifyAiAssistantTopicTitle(bad, 'no'), 'OPPDATERING')
  assert.equal(simplifyAiAssistantTopicTitle('one two three four', 'en'), 'UPDATE')
})

test('existing invalid titles are queued for reinterpretation without SQL substring rewriting', () => {
  assert.match(migration, /enqueue_ai_assistant_interpretation/)
  assert.match(migration, /ai_assistant_has_valid_topic_title/)
  assert.match(migration, /interpretation_status = 'pending'/)
  assert.doesNotMatch(migration, /substring|substr\(/i)
})

test('no timer, animation, polling, or additional refresh behavior is introduced', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.doesNotMatch(renderer, /setInterval|setTimeout|requestAnimationFrame|animate-|motion|refresh|poll/i)
})
