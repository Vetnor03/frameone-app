import { ASSISTANT_CAPABILITIES, type AssistantCapabilityId, type CapabilityArgument } from './capabilities.ts'

export type CapabilityArguments = Partial<Record<CapabilityArgument, unknown>>
type HandlerMode = 'execute' | 'read' | 'navigate'
type Scope = 'device_member' | 'signed_in_user'

export type CapabilityHandler = {
  mode: HandlerMode
  scope: Scope
  validate: (argumentsValue: CapabilityArguments) => CapabilityArguments | null
  missingQuestion: Partial<Record<CapabilityArgument, { en: string; no: string }>>
  run: <T>(dispatch: () => Promise<T>) => Promise<T>
}

const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as CapabilityArguments : {}
const clean = (value: unknown, max = 1000) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined
const pass = (value: unknown) => object(value)
const run = <T>(dispatch: () => Promise<T>) => dispatch()

const questions = {
  team: { en: 'Which football team would you like to use?', no: 'Hvilket fotballag vil du bruke?' },
  time: { en: 'What time were you at the surf spot?', no: 'Når var du på surfespoten?' },
  spot: { en: 'Which surf spot do you mean?', no: 'Hvilken surfespot mener du?' },
  date: { en: 'What date is the countdown for?', no: 'Hvilken dato er nedtellingen?' },
  title: { en: 'What should the countdown be called?', no: 'Hva skal nedtellingen hete?' },
} as const

export const ASSISTANT_CAPABILITY_HANDLERS: Record<AssistantCapabilityId, CapabilityHandler> = {
  'reminders.create': { mode: 'execute', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'reminders.read': { mode: 'read', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'groceries.add': { mode: 'execute', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'groceries.read': { mode: 'read', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'surf.log_experience': { mode: 'execute', scope: 'device_member', validate: pass, missingQuestion: { spot: questions.spot, time: questions.time }, run },
  'surf.read': { mode: 'read', scope: 'device_member', validate: pass, missingQuestion: { spot: questions.spot }, run },
  'weather.read': { mode: 'read', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'football.set_team': { mode: 'execute', scope: 'device_member', validate: pass, missingQuestion: { team: questions.team }, run },
  'football.read': { mode: 'read', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'countdown.create': { mode: 'execute', scope: 'device_member', validate: (value) => { const row = object(value); return { title: clean(row.title, 80), date: clean(row.date, 40) } }, missingQuestion: { title: questions.title, date: questions.date }, run },
  'settings.set_app_theme': { mode: 'execute', scope: 'signed_in_user', validate: pass, missingQuestion: {}, run },
  'frame.set_language': { mode: 'execute', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'frame.set_layout': { mode: 'execute', scope: 'device_member', validate: pass, missingQuestion: {}, run },
  'recipes.manage': { mode: 'navigate', scope: 'signed_in_user', validate: pass, missingQuestion: {}, run },
}

export function assertCapabilityRegistryIntegrity() {
  const ids = new Set<string>()
  for (const capability of ASSISTANT_CAPABILITIES) {
    if (ids.has(capability.id)) throw new Error(`Duplicate assistant capability: ${capability.id}`)
    ids.add(capability.id)
    const handler = ASSISTANT_CAPABILITY_HANDLERS[capability.id]
    if (!handler?.validate || !handler.scope || !handler.mode || !handler.run) throw new Error(`Missing handler: ${capability.id}`)
    for (const argument of capability.requiredArguments) if (!handler.missingQuestion[argument] && !['text', 'items', 'theme', 'language', 'layout', 'rating'].includes(argument)) throw new Error(`Missing clarification for ${capability.id}.${argument}`)
    if (typeof capability.destructive !== 'boolean' || !capability.coverage) throw new Error(`Incomplete policy: ${capability.id}`)
  }
  return true
}
