import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assistantHelpResult, resolveDeterministicAssistantHelp, validateAssistantHelpTopicId } from '../app/lib/assistant/help.ts'
import { resolveDeterministicCapabilityRequest } from '../app/lib/assistant/resolver.ts'

test('frame preview guidance is localized and never offers navigation', () => {
  const no = resolveDeterministicAssistantHelp('Hvordan ser jeg hva som er på skjermen min akkurat nå?', 'no')
  assert.equal(no?.message, 'Snu telefonen sidelengs for å se hva som vises på rammen akkurat nå.')
  assert.equal(no?.cta, undefined)
  const en = resolveDeterministicAssistantHelp("How do I see what's on my frame?", 'en')
  assert.equal(en?.message, 'Turn your phone sideways to see what is currently shown on your frame.')
  assert.equal(en?.cta, undefined)
})

test('common Norwegian product questions resolve locally with canonical CTAs', () => {
  const cases = [
    ['Hvor finner jeg oppskrifter?', 'Du finner oppskrifter under Handleliste → Oppskrifter.', 'groceries'],
    ['Hvordan endrer jeg fotballag?', 'Gå til Football og trykk på laget for å velge et nytt.', 'football'],
    ['Hvor legger jeg til en surfspot?', 'Gå til Surf, trykk på spotvelgeren og legg til en egen spot.', 'surf'],
    ['Hvordan kobler jeg Spond?', 'Gå til Påminnelser, trykk Koble til og velg Spond.', 'spond'],
    ['Hvor bytter jeg tema?', 'Gå til Innstillinger → Tema for å endre apptema.', 'settings'],
    ['Hvor endrer jeg språk?', 'Gå til Innstillinger → Språk for å endre språk.', 'settings'],
  ]
  for (const [question, message, destination] of cases) {
    const result = resolveDeterministicAssistantHelp(question, 'no')
    assert.equal(result?.message, message, question)
    assert.equal(result?.cta?.destination, destination, question)
  }
})

test('fuzzy AI output can select only registry copy, never generated prose', () => {
  // This paraphrase intentionally misses deterministic topic patterns.
  assert.equal(resolveDeterministicAssistantHelp('Could you take me to the place where meals inspire my cooking?', 'en'), null)
  const classified = validateAssistantHelpTopicId('recipes')
  assert.equal(classified, 'recipes')
  assert.deepEqual(assistantHelpResult(classified, 'en'), { status: 'completed', action: 'answer_help', message: 'You’ll find recipes under Groceries → Recipes.', cta: { label: 'Open Groceries', destination: 'groceries' } })
  assert.equal(validateAssistantHelpTopicId('general_knowledge'), null)

  const route = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
  assert.match(route, /model: process\.env\.ASSISTANT_INTENT_MODEL \|\| 'gpt-5-mini'/)
  assert.match(route, /Never write an answer; only classify/)
  assert.match(route, /helpTopicId.*assistantHelpResult/s)
  assert.doesNotMatch(route, /full app state/i)
})

test('general knowledge remains outside deterministic RE:MIND help', () => {
  assert.equal(resolveDeterministicAssistantHelp('Why do birds migrate?', 'en'), null)
})

test('concrete configuration commands remain executable capabilities', () => {
  const cases = [
    ['Bytt appen til dark mode', 'settings.set_app_theme'],
    ['Bytt fotballag til Dortmund', 'football.set_team'],
    ['Bytt språk til norsk', 'frame.set_language'],
    ['Bytt til layout 2', 'frame.set_layout'],
  ]
  for (const [request, capabilityId] of cases) {
    assert.equal(resolveDeterministicCapabilityRequest(request)?.capabilityId, capabilityId, request)
  }
  const route = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('resolveDeterministicCapabilityRequest(body.text)') < route.indexOf('resolveDeterministicAssistantHelp(body.text'))
  assert.match(route, /Choose a capability for a concrete request to perform a supported action/)
})

test('theme imperatives execute while question-shaped requests return help', () => {
  for (const request of ['Bytt tema til mørk', 'Endre tema til lyst', 'Change theme to dark', 'Switch theme to light']) {
    assert.equal(resolveDeterministicCapabilityRequest(request)?.capabilityId, 'settings.set_app_theme', request)
    assert.equal(resolveDeterministicAssistantHelp(request, 'no'), null, request)
  }
  for (const request of ['Hvordan bytter jeg tema?', 'Hvor endrer jeg tema?', 'How do I change the theme?']) {
    assert.equal(resolveDeterministicCapabilityRequest(request), null, request)
    const help = resolveDeterministicAssistantHelp(request, request.startsWith('How') ? 'en' : 'no')
    assert.equal(help?.action, 'answer_help', request)
    assert.equal(help?.cta?.destination, 'settings', request)
  }
})

test('recipes CTA truthfully opens the Groceries surface', () => {
  const result = resolveDeterministicAssistantHelp('Hvor finner jeg oppskrifter?', 'no')
  assert.deepEqual(result?.cta, { label: 'Åpne Handleliste', destination: 'groceries' })
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /case 'groceries': case 'recipes': setActiveTab\('groceries'\)/)
})
