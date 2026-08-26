import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assistantHelpResult, resolveDeterministicAssistantHelp, validateAssistantHelpTopicId } from '../app/lib/assistant/help.ts'

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
    ['Hvor finner jeg oppskrifter?', 'Du finner oppskrifter under Handleliste → Oppskrifter.', 'recipes'],
    ['Hvordan endrer jeg fotballag?', 'Gå til Football og trykk på laget for å velge et nytt.', 'football'],
    ['Hvor legger jeg til en surfspot?', 'Gå til Surf, trykk på spotvelgeren og legg til en egen spot.', 'surf'],
    ['Hvordan kobler jeg Spond?', 'Gå til Påminnelser, trykk Koble til og velg Spond.', 'spond'],
    ['Hvor bytter jeg tema?', 'Gå til Innstillinger → Tema for å endre apptema.', 'settings'],
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
  assert.deepEqual(assistantHelpResult(classified, 'en'), { status: 'completed', action: 'answer_help', message: 'You’ll find recipes under Groceries → Recipes.', cta: { label: 'Open Recipes', destination: 'recipes' } })
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
