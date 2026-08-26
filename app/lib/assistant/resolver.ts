import type { AssistantDestination, ResolvedAssistantIntent } from './types'
import { SURF_SPOTS } from '../surf/spots.ts'
import { ALL_TEAMS } from '../soccer/teams.ts'

const RESERVED_INPUT = /^(?:weather|vær|surf|layout|oppsett|settings|innstillinger|spond|reminders?|påminnelser?|groceries|grocery|dagligvarer|handleliste|countdown|nedtelling|frame|ramme|modules?|moduler?)$/i
const GROCERY_WORDS = new Set([
  'soyasaus', 'soy sauce', 'melk', 'milk', 'egg', 'eggs', 'brød', 'bread', 'ost', 'cheese', 'smør', 'butter',
  'yoghurt', 'yogurt', 'kaffe', 'coffee', 'te', 'tea', 'juice', 'epler', 'apples', 'bananer', 'bananas',
])
const SURF_RATINGS: Array<[RegExp, number]> = [
  [/\b(?:poor to fair|dårlig til grei)\b/i, 3], [/\b(?:flat|flatt)\b/i, 1], [/\b(?:poor|dårlig)\b/i, 2],
  [/\b(?:fair|grei)\b/i, 4], [/\b(?:good|god|bra)\b/i, 5], [/\b(?:epic|episk)\b/i, 6],
]

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

function surfExperience(text: string): ResolvedAssistantIntent | null {
  const spot = Object.values(SURF_SPOTS).find((candidate) => text.toLocaleLowerCase().includes(candidate.label.toLocaleLowerCase()))
  const rating = SURF_RATINGS.find(([pattern]) => pattern.test(text))?.[1]
  if (!spot || !rating) return null
  const time = text.match(/\b(?:at|kl\.?|around|rundt)\s*(?:ca\.?\s*)?(\d{1,2})(?::|\.)(\d{2})\b/i)
    || text.match(/\b(?:at|kl\.?|around|rundt)\s*(\d{1,2})\b/i)
  const date = /\b(?:yesterday|i går)\b/i.test(text) ? 'yesterday' : 'today'
  return { action: 'log_surf_experience', arguments: { spot: spot.label, rating, date, ...(time ? { time: `${time[1].padStart(2, '0')}:${(time[2] || '00').padStart(2, '0')}` } : {}), comment: text.trim() } }
}

function naturalReminder(text: string) {
  const hasDate = /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|i dag|i morgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b/i.test(text)
  const taskLike = /^(?:call|phone|dentist|doctor|appointment|ring|tannlege|lege|møte)\b/i.test(text)
  return hasDate && taskLike ? { action: 'create_reminder' as const, arguments: { text: text.trim() } } : null
}

export function resolveDeterministicAssistantIntent(text: string): ResolvedAssistantIntent | null {
  const request = text.trim()
  if (!request || request.length > 1_000) return null
  // Resolve against the same team catalogue as the Football picker. This is
  // data-driven: adding a team to the UI automatically makes it addressable.
  if (/\b(?:change|switch|set|bytt|endre|velg)\b/i.test(request) && /(?:football|soccer|fotball|team|lag)/i.test(request)) {
    const normalized = request.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    const team = [...ALL_TEAMS].sort((a, b) => b.teamName.length - a.teamName.length).find((candidate) => {
      const words = candidate.teamName.split(/\s+/)
      const names = [candidate.teamName, candidate.teamId.replaceAll('_', ' '), ...(words.length > 1 ? [words.at(-1)!] : [])]
      return names.some((name) => normalized.includes(name.toLocaleLowerCase()))
    })
    if (team) return { action: 'set_football_team', arguments: team }
  }
  const module = [
    { pattern: /^(?:weather|vær)$/i, destination: 'weather' as const, label: 'Open Weather' },
    { pattern: /^surf$/i, destination: 'surf' as const, label: 'Open Surf' },
    { pattern: /^(?:groceries|grocery|dagligvarer|handleliste)$/i, destination: 'groceries' as const, label: 'Open Groceries' },
    { pattern: /^(?:reminders?|påminnelser?)$/i, destination: 'reminders' as const, label: 'Open Reminders' },
    { pattern: /^(?:settings|innstillinger)$/i, destination: 'settings' as const, label: 'Open Settings' },
    { pattern: /^(?:layout|oppsett)$/i, destination: 'layout' as const, label: 'Open Layout Settings' },
    { pattern: /^spond$/i, destination: 'spond' as const, label: 'Open Spond Connect' },
  ].find((entry) => entry.pattern.test(request))
  if (module) return { action: 'answer_help', arguments: { destination: module.destination }, response: { status: 'completed', action: 'answer_help', message: `Open ${module.destination}.`, cta: { label: module.label, destination: module.destination } } }
  for (const entry of HELP) {
    if (entry.pattern.test(request) && /(?:where|how|open|find|change|connect|koble|hvor|hvordan)/i.test(request)) {
      return { action: 'answer_help', arguments: { destination: entry.destination }, response: { status: 'completed', action: 'answer_help', message: entry.message, cta: { label: entry.label, destination: entry.destination } } }
    }
  }
  const items = groceryItems(request)
  if (items) return { action: 'add_grocery_items', arguments: { items } }
  if (/^(?:(?:please\s+)?remind me|minn meg på)\s+/i.test(request)) return { action: 'create_reminder', arguments: { text: request } }
  const surf = surfExperience(request)
  if (surf) return surf
  const reminder = naturalReminder(request)
  if (reminder) return reminder
  const shorthandItems = shorthandGroceryItems(request)
  return shorthandItems ? { action: 'add_grocery_items', arguments: { items: shorthandItems } } : null
}

export function validateModelIntent(value: unknown): ResolvedAssistantIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.action === 'needs_input') return { action: 'needs_input', arguments: {} }
  if (input.action === 'add_grocery_items' && input.arguments && typeof input.arguments === 'object') {
    const items = (input.arguments as Record<string, unknown>).items
    if (Array.isArray(items) && items.length > 0 && items.length <= 30 && items.every((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string' && String((item as Record<string, unknown>).name).trim().length > 0 && String((item as Record<string, unknown>).name).length <= 80)) return { action: 'add_grocery_items', arguments: { items: items.map((item) => ({ name: String((item as Record<string, unknown>).name).trim(), ...(Number.isInteger((item as Record<string, unknown>).quantity) && Number((item as Record<string, unknown>).quantity) > 0 ? { quantity: Number((item as Record<string, unknown>).quantity) } : {}) })) } }
  }
  if (input.action === 'create_reminder' && input.arguments && typeof input.arguments === 'object') {
    const text = (input.arguments as Record<string, unknown>).text
    if (typeof text === 'string' && text.trim() && text.length <= 1_000) return { action: 'create_reminder', arguments: { text: text.trim() } }
  }
  if (input.action === 'set_football_team' && input.arguments && typeof input.arguments === 'object') {
    const requested = String((input.arguments as Record<string, unknown>).team || '').trim().toLocaleLowerCase()
    const team = requested && ALL_TEAMS.find((candidate) => [candidate.teamName, candidate.teamId.replaceAll('_', ' '), candidate.teamName.split(/\s+/).at(-1)!].some((name) => name.toLocaleLowerCase() === requested))
    if (team) return { action: 'set_football_team', arguments: team }
  }
  if (input.action === 'log_surf_experience' && input.arguments && typeof input.arguments === 'object') {
    const args = input.arguments as Record<string, unknown>
    if (typeof args.spot === 'string' && args.spot.trim() && Number.isInteger(args.rating) && Number(args.rating) >= 1 && Number(args.rating) <= 6 && typeof args.date === 'string' && typeof args.comment === 'string') return { action: 'log_surf_experience', arguments: { spot: args.spot.trim(), rating: Number(args.rating), date: args.date.trim(), ...(typeof args.time === 'string' && args.time.trim() ? { time: args.time.trim() } : {}), comment: args.comment.trim() } }
  }
  return null
}
