import type { AssistantCapabilityId } from './capabilities.ts'
import type { CapabilityArguments } from './handlers.ts'

export const ASSISTANT_DESTINATIONS = ['layout', 'groceries', 'reminders', 'settings', 'recipes', 'spond', 'surf', 'weather', 'countdown', 'date', 'football', 'stocks', 'assistant'] as const
export type AssistantDestination = typeof ASSISTANT_DESTINATIONS[number]

export type AssistantResult = {
  status: 'completed' | 'needs_confirmation' | 'needs_input' | 'error'
  message: string
  capabilityId?: AssistantCapabilityId
  action?: string // backwards-compatible UI/telemetry field
  cta?: { label: string; destination: AssistantDestination }
  pendingId?: string
}

export type ResolvedAssistantIntent = {
  capabilityId: AssistantCapabilityId
  arguments: CapabilityArguments
  missingArguments?: string[]
}
