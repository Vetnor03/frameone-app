/**
 * App-wide inventory used by both assistant routing and execution.
 *
 * A capability is included only when the corresponding surface exists in RE:MIND.
 * `executor` names an existing canonical adapter; capabilities without one are
 * still useful for reads/help/navigation and deliberately return a deep link.
 */
export const ASSISTANT_CAPABILITIES = [
  { id: 'frame.set_layout', domain: 'frame', operation: 'set_layout', kind: 'configuration', aliases: ['layout', 'oppsett'], requiredArguments: ['layout'], destination: 'layout', executor: 'device_settings' },
  { id: 'frame.configure_modules', domain: 'frame', operation: 'configure_modules', kind: 'configuration', aliases: ['modules', 'moduler'], requiredArguments: [], destination: 'layout' },
  { id: 'frame.set_theme', domain: 'frame', operation: 'set_theme', kind: 'configuration', aliases: ['frame theme', 'rammetema'], requiredArguments: ['theme'], destination: 'settings', executor: 'device_settings' },
  { id: 'frame.set_language', domain: 'frame', operation: 'set_language', kind: 'configuration', aliases: ['language', 'språk'], requiredArguments: ['language'], destination: 'settings', executor: 'device_settings' },
  { id: 'frame.update', domain: 'frame', operation: 'update', kind: 'write', aliases: ['update frame', 'oppdater ramme'], requiredArguments: [], destination: 'settings' },
  { id: 'frame.device_settings', domain: 'frame', operation: 'device_settings', kind: 'navigation', aliases: ['device settings', 'frame settings'], requiredArguments: [], destination: 'settings' },
  { id: 'reminders.create', domain: 'reminders', operation: 'create', kind: 'write', aliases: ['remind me', 'minn meg på'], requiredArguments: ['text'], destination: 'reminders', executor: 'reminders' },
  { id: 'reminders.read', domain: 'reminders', operation: 'read', kind: 'read', aliases: ['my reminders', 'mine påminnelser'], requiredArguments: [], destination: 'reminders' },
  { id: 'reminders.sources', domain: 'reminders', operation: 'manage_sources', kind: 'configuration', aliases: ['calendar', 'kalender', 'spond', 'teams', 'local events'], requiredArguments: [], destination: 'spond' },
  { id: 'groceries.add', domain: 'groceries', operation: 'add', kind: 'write', aliases: ['shopping list', 'handleliste'], requiredArguments: ['items'], destination: 'groceries', executor: 'groceries' },
  { id: 'groceries.read', domain: 'groceries', operation: 'read', kind: 'read', aliases: ['groceries', 'dagligvarer'], requiredArguments: [], destination: 'groceries' },
  { id: 'recipes.manage', domain: 'recipes', operation: 'manage', kind: 'navigation', aliases: ['recipes', 'oppskrifter'], requiredArguments: [], destination: 'recipes' },
  { id: 'surf.read', domain: 'surf', operation: 'forecast', kind: 'read', aliases: ['surf forecast', 'surfvarsel'], requiredArguments: [], destination: 'surf' },
  { id: 'surf.log', domain: 'surf', operation: 'log_experience', kind: 'write', aliases: ['log surf', 'logg surf'], requiredArguments: ['spot', 'rating', 'time'], destination: 'surf', executor: 'surf_log' },
  { id: 'surf.configure', domain: 'surf', operation: 'configure_spot', kind: 'configuration', aliases: ['surf spot', 'surfespot'], requiredArguments: ['spot'], destination: 'surf' },
  { id: 'weather.read', domain: 'weather', operation: 'forecast', kind: 'read', aliases: ['weather', 'vær'], requiredArguments: [], destination: 'weather' },
  { id: 'weather.configure', domain: 'weather', operation: 'set_location', kind: 'configuration', aliases: ['weather location', 'værsted'], requiredArguments: ['location'], destination: 'weather' },
  { id: 'countdown.manage', domain: 'countdown', operation: 'manage', kind: 'configuration', aliases: ['countdown', 'nedtelling'], requiredArguments: [], destination: 'countdown' },
  { id: 'date.configure', domain: 'date', operation: 'configure', kind: 'configuration', aliases: ['date', 'dato'], requiredArguments: [], destination: 'date' },
  { id: 'football.set_team', domain: 'football', operation: 'set_team', kind: 'configuration', aliases: ['football team', 'soccer team', 'fotballag'], requiredArguments: ['team'], destination: 'football', executor: 'football_settings' },
  { id: 'football.read', domain: 'football', operation: 'read', kind: 'read', aliases: ['football', 'soccer', 'fotball'], requiredArguments: [], destination: 'football' },
  { id: 'stocks.configure', domain: 'stocks', operation: 'configure', kind: 'configuration', aliases: ['stocks', 'aksjer'], requiredArguments: ['symbol'], destination: 'stocks' },
  { id: 'ai_follow.manage', domain: 'ai_follow', operation: 'manage', kind: 'navigation', aliases: ['ai follow', 'radar', 'follow'], requiredArguments: [], destination: 'assistant' },
  { id: 'settings.app_theme', domain: 'settings', operation: 'set_app_theme', kind: 'configuration', aliases: ['app theme', 'apptema'], requiredArguments: ['theme'], destination: 'settings' },
  { id: 'settings.open', domain: 'settings', operation: 'open', kind: 'navigation', aliases: ['settings', 'innstillinger'], requiredArguments: [], destination: 'settings' },
] as const

export type AssistantCapability = typeof ASSISTANT_CAPABILITIES[number]

export function capabilityById(id: string) {
  return ASSISTANT_CAPABILITIES.find((capability) => capability.id === id)
}

export function assistantCapabilityPrompt() {
  return ASSISTANT_CAPABILITIES.map(({ id, aliases, requiredArguments }) =>
    `${id} (phrases: ${aliases.join(', ')}; arguments: ${requiredArguments.join(', ') || 'none'})`
  ).join('\n')
}
