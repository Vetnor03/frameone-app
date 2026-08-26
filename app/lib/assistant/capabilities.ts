/**
 * App-wide inventory used by both assistant routing and execution.
 *
 * A capability is included only when the corresponding surface exists in RE:MIND.
 * `executor` names an existing canonical adapter; capabilities without one are
 * still useful for reads/help/navigation and deliberately return a deep link.
 */
export const CAPABILITY_ARGUMENTS = ['team', 'spot', 'rating', 'date', 'period', 'time', 'comment', 'title', 'targetDate', 'theme', 'language', 'layout', 'items', 'text'] as const
export type CapabilityArgument = typeof CAPABILITY_ARGUMENTS[number]

export const ASSISTANT_CAPABILITIES = [
  { id: 'frame.set_layout', domain: 'frame', operation: 'set_layout', kind: 'configuration', aliases: ['layout', 'oppsett'], requiredArguments: ['layout'], destination: 'layout', executor: 'device_settings' },
  { id: 'frame.set_language', domain: 'frame', operation: 'set_language', kind: 'configuration', aliases: ['language', 'språk'], requiredArguments: ['language'], destination: 'settings', executor: 'device_settings' },
  { id: 'frame.device_settings', domain: 'frame', operation: 'device_settings', kind: 'navigation', aliases: ['device settings', 'frame settings'], requiredArguments: [], destination: 'settings' },
  { id: 'reminders.create', domain: 'reminders', operation: 'create', kind: 'write', aliases: ['remind me', 'minn meg', 'ring i morgen'], requiredArguments: ['text'], destination: 'reminders', executor: 'reminder_parser' },
  { id: 'reminders.read', domain: 'reminders', operation: 'read', kind: 'read', aliases: ['my reminders', 'mine påminnelser'], requiredArguments: [], destination: 'reminders' },
  { id: 'groceries.add', domain: 'groceries', operation: 'add', kind: 'write', aliases: ['shopping list', 'handleliste'], requiredArguments: ['items'], destination: 'groceries', executor: 'groceries' },
  { id: 'groceries.read', domain: 'groceries', operation: 'read', kind: 'read', aliases: ['groceries', 'dagligvarer'], requiredArguments: [], destination: 'groceries' },
  { id: 'recipes.manage', domain: 'recipes', operation: 'manage', kind: 'navigation', aliases: ['recipes', 'oppskrifter'], requiredArguments: [], destination: 'recipes' },
  { id: 'surf.read', domain: 'surf', operation: 'forecast', kind: 'read', aliases: ['surf forecast', 'surfvarsel'], requiredArguments: [], destination: 'surf' },
  { id: 'surf.log_experience', domain: 'surf', operation: 'log_experience', kind: 'write', aliases: ['log surf', 'logg surf'], requiredArguments: ['spot', 'rating', 'time'], destination: 'surf', executor: 'surf_log' },
  { id: 'weather.read', domain: 'weather', operation: 'forecast', kind: 'read', aliases: ['weather', 'vær'], requiredArguments: [], destination: 'weather' },
  { id: 'football.set_team', domain: 'football', operation: 'set_team', kind: 'configuration', aliases: ['football team', 'soccer team', 'fotballag'], requiredArguments: ['team'], destination: 'football', executor: 'football_settings' },
  { id: 'football.read', domain: 'football', operation: 'read', kind: 'read', aliases: ['football', 'soccer', 'fotball'], requiredArguments: [], destination: 'football' },
  { id: 'ai_follow.manage', domain: 'ai_follow', operation: 'manage', kind: 'navigation', aliases: ['ai follow', 'radar', 'follow'], requiredArguments: [], destination: 'assistant' },
  { id: 'settings.open', domain: 'settings', operation: 'open', kind: 'navigation', aliases: ['settings', 'innstillinger'], requiredArguments: [], destination: 'settings' },
  { id: 'weather.open', domain: 'weather', operation: 'open', kind: 'navigation', aliases: ['weather', 'vær'], requiredArguments: [], destination: 'weather' },
  { id: 'surf.open', domain: 'surf', operation: 'open', kind: 'navigation', aliases: ['surf'], requiredArguments: [], destination: 'surf' },
  { id: 'reminders.open', domain: 'reminders', operation: 'open', kind: 'navigation', aliases: ['reminders', 'påminnelser'], requiredArguments: [], destination: 'reminders' },
  { id: 'groceries.open', domain: 'groceries', operation: 'open', kind: 'navigation', aliases: ['groceries', 'handleliste'], requiredArguments: [], destination: 'groceries' },
  { id: 'layout.open', domain: 'frame', operation: 'open_layout', kind: 'navigation', aliases: ['layout', 'oppsett'], requiredArguments: [], destination: 'layout' },
  { id: 'spond.open', domain: 'reminders', operation: 'open_spond', kind: 'navigation', aliases: ['spond'], requiredArguments: [], destination: 'spond' },
  { id: 'countdown.open', domain: 'countdown', operation: 'open', kind: 'navigation', aliases: ['countdown', 'nedtelling'], requiredArguments: [], destination: 'countdown' },
  { id: 'date.open', domain: 'date', operation: 'open', kind: 'navigation', aliases: ['date', 'dato'], requiredArguments: [], destination: 'date' },
  { id: 'stocks.open', domain: 'stocks', operation: 'open', kind: 'navigation', aliases: ['stocks', 'aksjer'], requiredArguments: [], destination: 'stocks' },
  { id: 'countdown.create', domain: 'countdown', operation: 'create', kind: 'write', aliases: ['countdown', 'nedtelling'], requiredArguments: ['title', 'targetDate'], destination: 'countdown', executor: 'countdowns' },
  { id: 'settings.set_app_theme', domain: 'settings', operation: 'set_app_theme', kind: 'configuration', aliases: ['app theme', 'apptema'], requiredArguments: ['theme'], destination: 'settings', executor: 'app_preferences' },
] as const

export const ASSISTANT_CAPABILITY_IDS = ASSISTANT_CAPABILITIES.map((capability) => capability.id)
export type AssistantCapabilityId = typeof ASSISTANT_CAPABILITIES[number]['id']

export type AssistantCapability = typeof ASSISTANT_CAPABILITIES[number]

export function capabilityById(id: string) {
  return ASSISTANT_CAPABILITIES.find((capability) => capability.id === id)
}

export function assistantCapabilityPrompt() {
  return ASSISTANT_CAPABILITIES.map(({ id, aliases, requiredArguments }) =>
    `${id} (phrases: ${aliases.join(', ')}; arguments: ${requiredArguments.join(', ') || 'none'})`
  ).join('\n')
}
