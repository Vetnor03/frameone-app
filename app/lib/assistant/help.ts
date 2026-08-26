import type { AssistantDestination, AssistantResult } from './types.ts'

type Copy = Record<'en' | 'no', string>

export type AssistantHelpTopic = {
  id: string
  intents: readonly string[]
  patterns: readonly RegExp[]
  destination?: AssistantDestination
  answer: Copy
  cta?: Copy
}

/** Trusted product copy and destinations for Assistant guidance. */
const defineHelpTopics = <const Topics extends readonly AssistantHelpTopic[]>(topics: Topics) => topics

export const ASSISTANT_HELP_TOPICS = defineHelpTopics([
  { id: 'frame_preview', intents: ['preview the frame', 'what is on the frame screen', 'se rammen på mobilen'], patterns: [/(?:what|hva).*(?:shown|showing|vises|på).*(?:frame|screen|skjerm|ramm)/i, /(?:see|view|preview|se|forhåndsvis).*(?:frame|screen|skjerm|ramm)/i, /(?:frame|ramm).*(?:on (?:my )?phone|på mobilen)/i], answer: { en: 'Turn your phone sideways to see what is currently shown on your frame.', no: 'Snu telefonen sidelengs for å se hva som vises på rammen akkurat nå.' } },
  { id: 'custom_surf_spot', intents: ['add custom surf spot', 'add secret spot'], patterns: [/(?:add|create|legg(?:er)?(?: jeg)? til|lag).*(?:custom|secret|egen|hemmelig)?\s*(?:a |an |en |et )?(?:surf ?spot|spot)/i], destination: 'surf', answer: { en: 'Open Surf, tap the spot selector, then add a custom spot.', no: 'Gå til Surf, trykk på spotvelgeren og legg til en egen spot.' }, cta: { en: 'Open Surf', no: 'Åpne Surf' } },
  { id: 'recipes', intents: ['find recipes', 'saved recipes'], patterns: [/(?:recipe|recipes|oppskrift|oppskrifter)/i], destination: 'groceries', answer: { en: 'You’ll find recipes under Groceries → Recipes.', no: 'Du finner oppskrifter under Handleliste → Oppskrifter.' }, cta: { en: 'Open Groceries', no: 'Åpne Handleliste' } },
  { id: 'dinner_plan', intents: ['find dinner plan', 'meal plan'], patterns: [/(?:dinner|meal) plan|middagsplan/i], destination: 'groceries', answer: { en: 'You’ll find Dinner Plan under Groceries.', no: 'Du finner Middagsplan under Handleliste.' }, cta: { en: 'Open Groceries', no: 'Åpne Handleliste' } },
  { id: 'football_team', intents: ['change football team', 'team selector'], patterns: [/(?:football|soccer|fotball).*(?:team|lag)|fotballag|(?:team|lag).*(?:football|soccer|fotball)/i], destination: 'football', answer: { en: 'Open Football and tap the team to choose a new one.', no: 'Gå til Football og trykk på laget for å velge et nytt.' }, cta: { en: 'Open Football', no: 'Åpne Football' } },
  { id: 'spond', intents: ['connect Spond'], patterns: [/spond/i], destination: 'spond', answer: { en: 'Open Reminders, tap Connect, then choose Spond.', no: 'Gå til Påminnelser, trykk Koble til og velg Spond.' }, cta: { en: 'Open Spond Connect', no: 'Åpne Spond-tilkobling' } },
  { id: 'weather_location', intents: ['change weather location'], patterns: [/(?:weather|vær).*(?:location|place|sted|lokasjon)|(?:location|place|sted|lokasjon).*(?:weather|vær)/i], destination: 'weather', answer: { en: 'Open Weather and tap the location to choose a new place.', no: 'Gå til Vær og trykk på stedet for å velge et nytt.' }, cta: { en: 'Open Weather', no: 'Åpne Vær' } },
  { id: 'weather', intents: ['find weather'], patterns: [/^(?:weather|vær)$/i], destination: 'weather', answer: { en: 'Open Weather to see the forecast.', no: 'Gå til Vær for å se værmeldingen.' }, cta: { en: 'Open Weather', no: 'Åpne Vær' } },
  { id: 'theme', intents: ['change theme', 'light or dark mode'], patterns: [/(?:theme|tema|dark mode|light mode|mørk modus|lys modus)/i], destination: 'settings', answer: { en: 'Open Settings → Theme to change the app theme.', no: 'Gå til Innstillinger → Tema for å endre apptema.' }, cta: { en: 'Open Settings', no: 'Åpne Innstillinger' } },
  { id: 'language', intents: ['change language'], patterns: [/(?:language|språk)/i], destination: 'settings', answer: { en: 'Open Settings → Language to change the language.', no: 'Gå til Innstillinger → Språk for å endre språk.' }, cta: { en: 'Open Settings', no: 'Åpne Innstillinger' } },
  { id: 'layout', intents: ['choose layout', 'create custom layout'], patterns: [/(?:layout|frame layout|oppsett)/i], destination: 'layout', answer: { en: 'Open FRAME to choose a layout or create a new one.', no: 'Gå til FRAME for å velge et oppsett eller lage et nytt.' }, cta: { en: 'Open Layout', no: 'Åpne Oppsett' } },
  { id: 'reminders', intents: ['add reminders', 'manage reminders'], patterns: [/(?:reminder|reminders|påminnelse|påminnelser)/i], destination: 'reminders', answer: { en: 'Open Reminders to add or manage reminders.', no: 'Gå til Påminnelser for å legge til eller administrere påminnelser.' }, cta: { en: 'Open Reminders', no: 'Åpne Påminnelser' } },
  { id: 'groceries', intents: ['find grocery list', 'shopping list'], patterns: [/(?:grocery list|shopping list|groceries|handleliste|dagligvarer)/i], destination: 'groceries', answer: { en: 'Open Groceries to see your shopping list.', no: 'Gå til Handleliste for å se handlelisten din.' }, cta: { en: 'Open Groceries', no: 'Åpne Handleliste' } },
  { id: 'surf', intents: ['find surf tab'], patterns: [/\bsurf\b/i], destination: 'surf', answer: { en: 'Open Surf to see forecasts and choose a spot.', no: 'Gå til Surf for å se varsler og velge en spot.' }, cta: { en: 'Open Surf', no: 'Åpne Surf' } },
  { id: 'countdown', intents: ['find countdown'], patterns: [/(?:countdown|nedtelling)/i], destination: 'countdown', answer: { en: 'Open Countdown to view or create countdowns.', no: 'Gå til Nedtelling for å se eller lage nedtellinger.' }, cta: { en: 'Open Countdown', no: 'Åpne Nedtelling' } },
  { id: 'ai_follow', intents: ['configure AI Follow', 'view AI Follow'], patterns: [/(?:ai follow|radar)/i], destination: 'assistant', answer: { en: 'Open Assistant to view or configure AI Follow.', no: 'Gå til Assistent for å se eller konfigurere AI Follow.' }, cta: { en: 'Open Assistant', no: 'Åpne Assistent' } },
  { id: 'stocks', intents: ['find stocks', 'investments'], patterns: [/(?:stocks|investments|aksjer|investeringer)/i], destination: 'stocks', answer: { en: 'Open Stocks to view your investments.', no: 'Gå til Aksjer for å se investeringene dine.' }, cta: { en: 'Open Stocks', no: 'Åpne Aksjer' } },
  { id: 'settings', intents: ['find settings'], patterns: [/(?:settings|innstillinger)/i], destination: 'settings', answer: { en: 'Open Settings to change app preferences.', no: 'Gå til Innstillinger for å endre appinnstillinger.' }, cta: { en: 'Open Settings', no: 'Åpne Innstillinger' } },
])

export type AssistantHelpTopicId = typeof ASSISTANT_HELP_TOPICS[number]['id']

export const ASSISTANT_HELP_TOPIC_IDS = ASSISTANT_HELP_TOPICS.map((topic) => topic.id) as AssistantHelpTopicId[]

export function assistantHelpResult(id: AssistantHelpTopicId, language: 'en' | 'no'): AssistantResult {
  const topic: AssistantHelpTopic | undefined = ASSISTANT_HELP_TOPICS.find((candidate) => candidate.id === id)
  if (!topic) throw new Error(`Unknown Assistant help topic: ${id}`)
  return { status: 'completed', action: 'answer_help', message: topic.answer[language], ...(topic.destination && topic.cta ? { cta: { label: topic.cta[language], destination: topic.destination } } : {}) }
}

export function validateAssistantHelpTopicId(value: unknown): AssistantHelpTopicId | null {
  return typeof value === 'string' && ASSISTANT_HELP_TOPIC_IDS.includes(value as AssistantHelpTopicId) ? value as AssistantHelpTopicId : null
}

export function resolveDeterministicAssistantHelp(text: string, language: 'en' | 'no' = 'en'): AssistantResult | null {
  const request = text.trim()
  if (!request || request.length > 1_000) return null
  const asksForGuidance = /(?:\b(?:where|how|find|open|connect|see|view|preview|hvor|hvordan|finn|åpne|koble|se|forhåndsvis)\b|\bwhat\b.*\b(?:shown|showing)\b|\bhva\b.*\bvises\b)/i.test(request)
  if (!asksForGuidance && !/^(?:settings|innstillinger|spond|weather|vær|surf|reminders?|påminnelser?|groceries|handleliste|layout|oppsett)$/i.test(request)) return null
  const topic = ASSISTANT_HELP_TOPICS.find((candidate) => candidate.patterns.some((pattern) => pattern.test(request)))
  return topic ? { ...assistantHelpResult(topic.id, language), analytics: { resolver: 'deterministic', outcome: 'completed', helpTopicId: topic.id } } : null
}

export function assistantHelpPrompt() {
  return ASSISTANT_HELP_TOPICS.map((topic) => `${topic.id}: ${topic.intents.join(', ')}`).join('\n')
}
