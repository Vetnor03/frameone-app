import type { AssistantDestination } from './types.ts'

export type CapabilityKind = 'write' | 'read' | 'configuration' | 'navigation'
export type CapabilityArgument = 'items' | 'text' | 'spot' | 'spotId' | 'rating' | 'time' | 'date' | 'comment' | 'team' | 'teamId' | 'teamName' | 'competitionId' | 'competitionName' | 'title' | 'theme' | 'language' | 'layout'

export type AssistantCapability = {
  id: string
  domain: string
  operation: string
  kind: CapabilityKind
  aliases: readonly string[]
  requiredArguments: readonly CapabilityArgument[]
  destination: AssistantDestination
  destructive: boolean
  coverage: string
}

/** Only capabilities backed by a real handler belong here. */
export const ASSISTANT_CAPABILITIES = [
  { id: 'reminders.create', domain: 'reminders', operation: 'create', kind: 'write', aliases: ['remind me', 'minn meg på'], requiredArguments: ['text'], destination: 'reminders', destructive: false, coverage: 'existing-reminder-parser' },
  { id: 'reminders.read', domain: 'reminders', operation: 'read', kind: 'read', aliases: ['my reminders', 'mine påminnelser'], requiredArguments: [], destination: 'reminders', destructive: false, coverage: 'core-read-e2e' },
  { id: 'groceries.add', domain: 'groceries', operation: 'add', kind: 'write', aliases: ['add groceries', 'legg til på handlelisten'], requiredArguments: ['items'], destination: 'groceries', destructive: false, coverage: 'canonical-grocery-action' },
  { id: 'groceries.read', domain: 'groceries', operation: 'read', kind: 'read', aliases: ['shopping list', 'handleliste'], requiredArguments: [], destination: 'groceries', destructive: false, coverage: 'core-read-e2e' },
  { id: 'surf.log_experience', domain: 'surf', operation: 'log_experience', kind: 'write', aliases: ['log surf', 'logg surf'], requiredArguments: ['spot', 'rating', 'time'], destination: 'surf', destructive: false, coverage: 'existing-surf-log' },
  { id: 'surf.read', domain: 'surf', operation: 'forecast', kind: 'read', aliases: ['surf forecast', 'surfforhold'], requiredArguments: ['spot'], destination: 'surf', destructive: false, coverage: 'core-read-e2e' },
  { id: 'weather.read', domain: 'weather', operation: 'forecast', kind: 'read', aliases: ['weather', 'vær'], requiredArguments: [], destination: 'weather', destructive: false, coverage: 'core-read-e2e' },
  { id: 'football.set_team', domain: 'football', operation: 'set_team', kind: 'configuration', aliases: ['football team', 'soccer team', 'fotballag'], requiredArguments: ['team'], destination: 'football', destructive: false, coverage: 'football-settings-e2e' },
  { id: 'football.read', domain: 'football', operation: 'read', kind: 'read', aliases: ['followed football team', 'football settings', 'fotballag'], requiredArguments: [], destination: 'football', destructive: false, coverage: 'core-read-e2e' },
  { id: 'countdown.create', domain: 'countdown', operation: 'create', kind: 'write', aliases: ['create countdown', 'lag nedtelling'], requiredArguments: ['title', 'date'], destination: 'countdown', destructive: false, coverage: 'countdown-e2e' },
  { id: 'settings.set_app_theme', domain: 'settings', operation: 'set_app_theme', kind: 'configuration', aliases: ['app theme', 'dark mode', 'apptema'], requiredArguments: ['theme'], destination: 'settings', destructive: false, coverage: 'settings-e2e' },
  { id: 'frame.set_language', domain: 'frame', operation: 'set_language', kind: 'configuration', aliases: ['language', 'språk'], requiredArguments: ['language'], destination: 'settings', destructive: false, coverage: 'settings-e2e' },
  { id: 'frame.set_layout', domain: 'frame', operation: 'set_layout', kind: 'configuration', aliases: ['layout', 'oppsett'], requiredArguments: ['layout'], destination: 'layout', destructive: false, coverage: 'settings-e2e' },
  { id: 'recipes.manage', domain: 'recipes', operation: 'manage', kind: 'navigation', aliases: ['recipes', 'oppskrifter'], requiredArguments: [], destination: 'recipes', destructive: false, coverage: 'navigation-exhaustive' },
] as const satisfies readonly AssistantCapability[]

export type AssistantCapabilityId = typeof ASSISTANT_CAPABILITIES[number]['id']
export const ASSISTANT_CAPABILITY_IDS = ASSISTANT_CAPABILITIES.map(({ id }) => id) as AssistantCapabilityId[]
export const ASSISTANT_ROUTING_IDS = [...ASSISTANT_CAPABILITY_IDS, 'unsupported'] as const

export function capabilityById(id: string) { return ASSISTANT_CAPABILITIES.find((capability) => capability.id === id) }
export function assistantCapabilityPrompt() { return ASSISTANT_CAPABILITIES.map(({ id, aliases, requiredArguments }) => `${id} (${aliases.join(', ')}; required: ${requiredArguments.join(', ') || 'none'})`).join('\n') }
