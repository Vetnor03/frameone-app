export const ASSISTANT_ACTIONS = ['add_grocery_items', 'create_reminder', 'navigate', 'answer_help'] as const
export type AssistantActionName = typeof ASSISTANT_ACTIONS[number]

export type AssistantResult = {
  status: 'completed' | 'needs_confirmation' | 'needs_input' | 'error'
  message: string
  action?: AssistantActionName
  cta?: { label: string; destination: AssistantDestination }
  pendingId?: string
}

export const ASSISTANT_DESTINATIONS = ['layout', 'groceries', 'reminders', 'settings', 'recipes', 'spond'] as const
export type AssistantDestination = typeof ASSISTANT_DESTINATIONS[number]

export type ResolvedAssistantIntent =
  | { action: 'add_grocery_items'; arguments: { items: string[] } }
  | { action: 'create_reminder'; arguments: { text: string } }
  | { action: 'answer_help'; arguments: { destination: AssistantDestination }; response: AssistantResult }
