import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectAiAssistantFrameItems } from '../app/lib/device/aiAssistantFrame.ts'
import { simplifyAiAssistantTopicTitle } from '../app/lib/device/aiAssistantTopicTitle.ts'

const route = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const interpreter = readFileSync(new URL('../supabase/functions/interpret-ai-assistant/index.ts', import.meta.url), 'utf8')
const topicHelper = readFileSync(new URL('../app/lib/device/aiAssistantTopicTitle.ts', import.meta.url), 'utf8')

function row(id, extra = {}) {
  return {
    id,
    headline: 'Arrangementer i Stavanger helgen 18.–19. juli',
    summary: 'Lørdag er det moteshow kl. 18. Søndag arrangeres fotballfest kl. 17.',
    is_read: false,
    dismissed_from_frame: false,
    created_at: '2026-07-14T11:00:00.000Z',
    monitoring_watches: { owner_user_id: 'member-a', title: 'Skjer det noe kjekt i Stavanger til helgen?', preferred_language: 'no' },
    ...extra,
  }
}

const options = { memberUserIds: ['member-a'], now: new Date('2026-07-14T12:00:00.000Z'), limit: 2 }

test('displayed update uses its Watch topic as the shared header field', () => {
  const selected = selectAiAssistantFrameItems([row('stavanger')], options)
  assert.equal(selected.items[0].topicTitle, 'STAVANGER')
  assert.match(route, /aiAssistantTopicTitle: selected\.items\[0\]\?\.topicTitle \|\| activeTopicTitle/)
  assert.match(home, /const header = items\[0\]\?\.topicTitle \|\| mirrorAiAssistantEmptyHeader/)
})

test('valid short titles remain unchanged', () => {
  assert.equal(simplifyAiAssistantTopicTitle('Coldplay', 'no'), 'COLDPLAY')
  assert.equal(simplifyAiAssistantTopicTitle('Surfutstyr', 'no'), 'SURFUTSTYR')
})

test('long question-style titles are not rendered directly', () => {
  const title = 'Skjer det noe kjekt i Stavanger til helgen?'
  assert.equal(simplifyAiAssistantTopicTitle(title, 'no'), 'STAVANGER')
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

test('empty state headers use one topic, multiple FOLLOWING or FØLGER MED, and zero RE:MIND', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /if \(count <= 0\) return 'RE:MIND'/)
  assert.match(renderer, /if \(count === 1\) return mirrorAiAssistantHeader\(detail, language\)/)
  assert.match(renderer, /aiAssistantMultipleWatchesHeader\(language\)/)
  assert.match(topicHelper, /FØLGER MED|FOLLOWING/)
})

test('topic title interpretation rules are implemented without reducing detailed monitoring fields', () => {
  for (const phrase of ['very short stable topic title', 'never more than three words', 'Never expose the complete original request in title', 'Keep original_request unchanged', 'normalized_goal, trigger_description, and search_guidance']) assert.match(interpreter, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('no timer, animation, polling, or additional refresh behavior is introduced', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.doesNotMatch(renderer, /setInterval|setTimeout|requestAnimationFrame|animate-|motion|refresh|poll/i)
})
