import type { AssistantDestination, ResolvedAssistantIntent } from './types'

const RESERVED_INPUT = /^(?:weather|vær|layout|oppsett|settings|innstillinger|spond|reminders?|påminnelser?|countdown|nedtelling|frame|ramme|modules?|moduler?)$/i
const GROCERY_WORDS = new Set([
  'soyasaus', 'soy sauce', 'melk', 'milk', 'egg', 'eggs', 'brød', 'bread', 'ost', 'cheese', 'smør', 'butter',
  'yoghurt', 'yogurt', 'kaffe', 'coffee', 'te', 'tea', 'juice', 'epler', 'apples', 'bananer', 'bananas',
])

export function isReservedAssistantInput(text: string) {
  return RESERVED_INPUT.test(text.trim().replace(/[.!?]+$/, ''))
}

function parseGroceryParts(value: string) {
  const parts = value.split(/\s*(?:,|\band\b|\bog\b|&)\s*/i).map((item) => item.trim()).filter(Boolean)
  if (!parts.length || parts.length > 30) return null
  const items = parts.map((part) => {
    const quantityMatch = part.match(/^(\d{1,2})\s+(.+)$/)
    return { name: (quantityMatch?.[2] || part).trim(), ...(quantityMatch ? { quantity: Number(quantityMatch[1]) } : {}) }
  })
  return items.some(({ name }) => isReservedAssistantInput(name)) ? null : items
}

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
  const items = parseGroceryParts(value)
  const reserved = /^(?:a\s+|en\s+|et\s+)?(?:weather|vær|countdown|nedtelling|reminders?|påminnelser?|spond|layout|oppsett|modules?|moduler?)(?:\s|$)|\b(?:to|on|på)\s+(?:(?:my|min)\s+)?(?:frame|ramme)\b/i
  return items && !items.some((item) => reserved.test(item.name)) ? items : null
}

function shorthandGroceryItems(text: string) {
  if (isReservedAssistantInput(text) || text.length > 80 || /[?!]/.test(text)) return null
  const items = parseGroceryParts(text.replace(/[.]$/, ''))
  if (!items || !items.every(({ name }) => GROCERY_WORDS.has(name.toLocaleLowerCase()))) return null
  return items
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
  const shorthandItems = shorthandGroceryItems(request)
  return shorthandItems ? { action: 'add_grocery_items', arguments: { items: shorthandItems } } : null
}

export function validateModelIntent(value: unknown): ResolvedAssistantIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.action === 'add_grocery_items' && input.arguments && typeof input.arguments === 'object') {
    const items = (input.arguments as Record<string, unknown>).items
    if (Array.isArray(items) && items.length > 0 && items.length <= 30 && items.every((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string' && String((item as Record<string, unknown>).name).trim().length > 0 && String((item as Record<string, unknown>).name).length <= 80)) return { action: 'add_grocery_items', arguments: { items: items.map((item) => ({ name: String((item as Record<string, unknown>).name).trim(), ...(Number.isInteger((item as Record<string, unknown>).quantity) && Number((item as Record<string, unknown>).quantity) > 0 ? { quantity: Number((item as Record<string, unknown>).quantity) } : {}) })) } }
  }
  if (input.action === 'create_reminder' && input.arguments && typeof input.arguments === 'object') {
    const text = (input.arguments as Record<string, unknown>).text
    if (typeof text === 'string' && text.trim() && text.length <= 1_000) return { action: 'create_reminder', arguments: { text: text.trim() } }
  }
  return null
}
