import type { AssistantDestination, ResolvedAssistantIntent } from './types'

const HELP: Array<{ pattern: RegExp; destination: AssistantDestination; message: string; label: string }> = [
  { pattern: /(?:layout|frame layout|oppsett)/i, destination: 'layout', message: 'Choose a layout from FRAME, or create a custom one there.', label: 'Open Layout Settings' },
  { pattern: /(?:connect|koble).*(?:spond)|spond.*(?:connect|koble)/i, destination: 'spond', message: 'Connect Spond from Reminders.', label: 'Open Spond Connect' },
  { pattern: /(?:recipe|recipes|oppskrift)/i, destination: 'groceries', message: 'Your saved recipes are in Groceries.', label: 'Open Groceries' },
  { pattern: /(?:settings|innstillinger)/i, destination: 'settings', message: 'You can change app preferences in Settings.', label: 'Open Settings' },
]

function groceryItems(text: string) {
  const match = text.trim().match(/^(?:(?:please\s+)?add|legg til)\s+(.+?)(?:\s+(?:to|på)\s+(?:(?:my|min)\s+)?(?:grocery|groceries|grocery list|shopping list|handlelisten|handleliste))?[.!]?$/i)
  if (!match) return null
  const value = match[1].replace(/\s+(?:to|in|på)\s+(?:(?:my|min)\s+)?(?:grocery|groceries|grocery list|shopping list|handlelisten|handleliste)$/i, '')
  const items = value.split(/\s*(?:,|\band\b|\bog\b|&)\s*/i).map((item) => item.trim()).filter(Boolean)
  const reserved = /^(?:a\s+|en\s+|et\s+)?(?:weather|vær|countdown|nedtelling|reminders?|påminnelser?|spond|layout|oppsett|modules?|moduler?)(?:\s|$)|\b(?:to|on|på)\s+(?:(?:my|min)\s+)?(?:frame|ramme)\b/i
  return items.length && items.length <= 30 && !items.some((item) => reserved.test(item)) ? items : null
}

export function resolveDeterministicAssistantIntent(text: string): ResolvedAssistantIntent | null {
  const request = text.trim()
  if (!request || request.length > 1_000) return null
  for (const entry of HELP) {
    if (entry.pattern.test(request) && /(?:where|how|open|find|change|connect|koble|hvor|hvordan)/i.test(request)) {
      return { action: 'answer_help', arguments: { destination: entry.destination }, response: { status: 'completed', action: 'answer_help', message: entry.message, cta: { label: entry.label, destination: entry.destination } } }
    }
  }
  const items = groceryItems(request)
  if (items) return { action: 'add_grocery_items', arguments: { items } }
  if (/^(?:(?:please\s+)?remind me|minn meg på)\s+/i.test(request)) return { action: 'create_reminder', arguments: { text: request } }
  return null
}

export function validateModelIntent(value: unknown): ResolvedAssistantIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.action === 'add_grocery_items' && input.arguments && typeof input.arguments === 'object') {
    const items = (input.arguments as Record<string, unknown>).items
    if (Array.isArray(items) && items.length > 0 && items.length <= 30 && items.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 80)) return { action: 'add_grocery_items', arguments: { items: items.map((item) => String(item).trim()) } }
  }
  if (input.action === 'create_reminder' && input.arguments && typeof input.arguments === 'object') {
    const text = (input.arguments as Record<string, unknown>).text
    if (typeof text === 'string' && text.trim() && text.length <= 1_000) return { action: 'create_reminder', arguments: { text: text.trim() } }
  }
  return null
}
