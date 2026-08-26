/** The truthful set of operations the Assistant can execute or navigate to. */
export const CAPABILITY_ARGUMENTS = ['team', 'spot', 'rating', 'date', 'time', 'comment', 'title', 'targetDate', 'theme', 'language', 'layout', 'items', 'text'] as const
export type CapabilityArgument = typeof CAPABILITY_ARGUMENTS[number]

export const ASSISTANT_CAPABILITIES = [
  { id: 'football.set_team', domain: 'football', operation: 'set_team', kind: 'configuration', aliases: ['change football team', 'bytt fotballag'], requiredArguments: ['team'], destination: 'football' },
  { id: 'football.read', domain: 'football', operation: 'read', kind: 'read', aliases: ['selected football team', 'hvilket fotballag'], requiredArguments: [], destination: 'football' },
  { id: 'groceries.add', domain: 'groceries', operation: 'add', kind: 'write', aliases: ['add groceries', 'legg til på handlelisten'], requiredArguments: ['items'], destination: 'groceries' },
  { id: 'groceries.read', domain: 'groceries', operation: 'read', kind: 'read', aliases: ['shopping list', 'handlelisten'], requiredArguments: [], destination: 'groceries' },
  { id: 'reminders.create', domain: 'reminders', operation: 'create', kind: 'write', aliases: ['remind me', 'minn meg på'], requiredArguments: ['text'], destination: 'reminders' },
  { id: 'reminders.read', domain: 'reminders', operation: 'read', kind: 'read', aliases: ['my reminders', 'mine påminnelser'], requiredArguments: [], destination: 'reminders' },
  { id: 'surf.log_experience', domain: 'surf', operation: 'log_experience', kind: 'write', aliases: ['log surf', 'logg surf'], requiredArguments: ['spot', 'rating', 'date', 'time'], destination: 'surf' },
  { id: 'surf.read', domain: 'surf', operation: 'forecast', kind: 'read', aliases: ['surf forecast', 'hvordan blir surf'], requiredArguments: [], destination: 'surf' },
  { id: 'weather.read', domain: 'weather', operation: 'forecast', kind: 'read', aliases: ['weather forecast', 'hvordan blir været'], requiredArguments: [], destination: 'weather' },
  { id: 'countdown.create', domain: 'countdown', operation: 'create', kind: 'write', aliases: ['create countdown', 'lag nedtelling'], requiredArguments: ['title', 'targetDate'], destination: 'countdown' },
  { id: 'settings.set_app_theme', domain: 'settings', operation: 'set_app_theme', kind: 'configuration', aliases: ['app theme', 'dark mode', 'apptema'], requiredArguments: ['theme'], destination: 'settings' },
  { id: 'frame.set_language', domain: 'frame', operation: 'set_language', kind: 'configuration', aliases: ['change language', 'bytt språk'], requiredArguments: ['language'], destination: 'settings' },
  { id: 'frame.set_layout', domain: 'frame', operation: 'set_layout', kind: 'configuration', aliases: ['change layout', 'bytt layout'], requiredArguments: ['layout'], destination: 'layout' },
  { id: 'settings.open', domain: 'settings', operation: 'open', kind: 'navigation', aliases: ['settings', 'innstillinger'], requiredArguments: [], destination: 'settings' },
  { id: 'weather.open', domain: 'weather', operation: 'open', kind: 'navigation', aliases: ['weather', 'vær'], requiredArguments: [], destination: 'weather' },
  { id: 'surf.open', domain: 'surf', operation: 'open', kind: 'navigation', aliases: ['surf'], requiredArguments: [], destination: 'surf' },
  { id: 'reminders.open', domain: 'reminders', operation: 'open', kind: 'navigation', aliases: ['reminders', 'påminnelser'], requiredArguments: [], destination: 'reminders' },
  { id: 'groceries.open', domain: 'groceries', operation: 'open', kind: 'navigation', aliases: ['groceries', 'handleliste'], requiredArguments: [], destination: 'groceries' },
  { id: 'recipes.open', domain: 'recipes', operation: 'open', kind: 'navigation', aliases: ['recipes', 'oppskrifter'], requiredArguments: [], destination: 'recipes' },
  { id: 'layout.open', domain: 'frame', operation: 'open_layout', kind: 'navigation', aliases: ['layout', 'oppsett'], requiredArguments: [], destination: 'layout' },
  { id: 'spond.open', domain: 'reminders', operation: 'open_spond', kind: 'navigation', aliases: ['spond'], requiredArguments: [], destination: 'spond' },
  { id: 'countdown.open', domain: 'countdown', operation: 'open', kind: 'navigation', aliases: ['countdowns', 'nedtellinger'], requiredArguments: [], destination: 'countdown' },
  { id: 'date.open', domain: 'date', operation: 'open', kind: 'navigation', aliases: ['date', 'dato'], requiredArguments: [], destination: 'date' },
  { id: 'football.open', domain: 'football', operation: 'open', kind: 'navigation', aliases: ['football', 'fotball'], requiredArguments: [], destination: 'football' },
  { id: 'stocks.open', domain: 'stocks', operation: 'open', kind: 'navigation', aliases: ['stocks', 'aksjer'], requiredArguments: [], destination: 'stocks' },
  { id: 'assistant.open', domain: 'ai_follow', operation: 'open', kind: 'navigation', aliases: ['ai follow', 'assistant', 'radar'], requiredArguments: [], destination: 'assistant' },
] as const

export type AssistantCapability = typeof ASSISTANT_CAPABILITIES[number]
export type AssistantCapabilityId = AssistantCapability['id']
export const ASSISTANT_CAPABILITY_IDS = ASSISTANT_CAPABILITIES.map(({ id }) => id) as AssistantCapabilityId[]
export function capabilityById(id: string) { return ASSISTANT_CAPABILITIES.find((capability) => capability.id === id) }
export function isAssistantCapabilityId(id: unknown): id is AssistantCapabilityId { return typeof id === 'string' && ASSISTANT_CAPABILITY_IDS.includes(id as AssistantCapabilityId) }
export function assistantCapabilityPrompt() { return ASSISTANT_CAPABILITIES.map(({ id, aliases, requiredArguments }) => `${id} (phrases: ${aliases.join(', ')}; arguments: ${requiredArguments.join(', ') || 'none'})`).join('\n') }
