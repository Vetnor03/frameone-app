export const ASSISTANT_ACTIONS = ['add_grocery_items', 'create_reminder', 'log_surf_experience', 'set_football_team', 'capability', 'navigate', 'answer_help', 'needs_input'] as const
export type AssistantActionName = typeof ASSISTANT_ACTIONS[number]

export type AssistantResult = {
  status: 'completed' | 'needs_confirmation' | 'needs_input' | 'unsupported' | 'error'
  message: string
  action?: AssistantActionName
  cta?: { label: string; destination: AssistantDestination }
  pendingId?: string
  appTheme?: 'dark' | 'light'
  analytics?: { resolver?: 'deterministic' | 'ai'; outcome?: 'completed' | 'needs_input' | 'unsupported' | 'error'; capabilityId?: string; helpTopicId?: string; recurring?: boolean }
}

export const ASSISTANT_DESTINATIONS = ['layout', 'groceries', 'reminders', 'settings', 'recipes', 'spond', 'surf', 'weather', 'countdown', 'date', 'football', 'stocks', 'assistant'] as const
export type AssistantDestination = typeof ASSISTANT_DESTINATIONS[number]

export type ResolvedAssistantIntent =
  | { action: 'add_grocery_items'; arguments: { items: Array<{ name: string; quantity?: number }> } }
  | { action: 'create_reminder'; arguments: { text: string } }
  | { action: 'log_surf_experience'; arguments: { spot: string; rating: number; date: string; time?: string; comment: string } }
  | { action: 'set_football_team'; arguments: { teamId: string; teamName: string; competitionId?: string; competitionName?: string } }
  | { action: 'capability'; arguments: { id: string; values: Record<string, unknown> } }
  | { action: 'needs_input'; arguments: Record<string, never> }
  | { action: 'answer_help'; arguments: { destination: AssistantDestination }; response: AssistantResult }
