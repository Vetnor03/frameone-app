import type { AssistantDestination, ResolvedAssistantIntent } from './types'
import { SURF_SPOTS } from '../surf/spots.ts'
import { ALL_TEAMS } from '../soccer/teams.ts'
import type { CapabilityRequest } from './handlers.ts'
import { ASSISTANT_CAPABILITY_IDS } from './capabilities.ts'
import { resolveDeterministicAssistantHelp } from './help.ts'

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
  const forecastPeriod = /\b(?:tomorrow|i morgen)\b/i.test(request) ? 'tomorrow' : /\b(?:today|i dag|now|nå)\b/i.test(request) ? 'today' : 'current'
  if (/\b(?:weather|forecast|vær|været|værmelding)\b/i.test(request) && /(?:how|what|hvordan|hva|blir|becomes|forecast)/i.test(request)) {
    return { action: 'capability', arguments: { id: 'weather.read', values: { period: forecastPeriod } } }
  }
  const requestedSurfSpot = Object.values(SURF_SPOTS).find((spot) => request.toLocaleLowerCase().includes(spot.label.toLocaleLowerCase()))
  if (requestedSurfSpot && /\b(?:tomorrow|today|forecast|conditions|i morgen|i dag|blir|forhold)\b/i.test(request) && !SURF_RATINGS.some(([pattern]) => pattern.test(request))) {
    return { action: 'capability', arguments: { id: 'surf.read', values: { spot: requestedSurfSpot.label, period: forecastPeriod } } }
  }
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
  const help = resolveDeterministicAssistantHelp(request)
  if (help) return { action: 'answer_help', arguments: { destination: help.cta?.destination ?? 'assistant' }, response: help }
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

export function resolveDeterministicCapabilityRequest(text: string): CapabilityRequest | null {
  const request = text.trim()
  if (!request || request.length > 1_000) return null
  if (/\b(?:hvilket|which|what)\b.*\b(?:fotballag|football team|soccer team)\b|\b(?:fotballag|football team)\b.*\b(?:følger|selected|follow)/i.test(request)) return { capabilityId: 'football.read', arguments: {} }
  if (/\b(?:hva|what)\b.*\b(?:handlelisten|shopping list|grocer)/i.test(request)) return { capabilityId: 'groceries.read', arguments: {} }
  if (/\b(?:lag|create|start)\b.*\b(?:nedtelling|countdown)\b/i.test(request)) {
    const date = request.match(/\b\d{1,2}\.?\s+[\p{L}]+(?:\s+20\d{2})?/u)?.[0]
    const title = request.replace(/^.*?\b(?:nedtelling|countdown)\b\s*(?:til|for)?\s*/i, '').replace(date ?? /$^/, '').trim()
    return { capabilityId: 'countdown.create', arguments: { title, ...(date ? { targetDate: date } : {}) } }
  }
  if (/\b(?:app|appen)\b.*\b(?:dark|light|mørk|lys)/i.test(request)) return { capabilityId: 'settings.set_app_theme', arguments: { theme: request } }
  if (/\b(?:språk|language)\b.*\b(?:norsk|norwegian|engelsk|english)/i.test(request)) return { capabilityId: 'frame.set_language', arguments: { language: request } }
  const layout = request.match(/\b(?:layout|oppsett)\s*[1-4]\b/i)?.[0]
  if (layout && /\b(?:bytt|change|switch|set)\b/i.test(request)) return { capabilityId: 'frame.set_layout', arguments: { layout } }
  const legacy = resolveDeterministicAssistantIntent(request)
  if (!legacy) return null
  if (legacy.action === 'capability') return { capabilityId: legacy.arguments.id, arguments: legacy.arguments.values }
  if (legacy.action === 'add_grocery_items') return { capabilityId: 'groceries.add', arguments: legacy.arguments }
  if (legacy.action === 'create_reminder') return { capabilityId: 'reminders.create', arguments: legacy.arguments }
  if (legacy.action === 'log_surf_experience') return { capabilityId: 'surf.log_experience', arguments: legacy.arguments }
  if (legacy.action === 'set_football_team') return { capabilityId: 'football.set_team', arguments: { team: legacy.arguments.teamId } }
  if (legacy.action === 'answer_help') {
    const openIds: Partial<Record<AssistantDestination, string>> = { settings: 'settings.open', surf: 'surf.open', weather: 'weather.open', groceries: 'groceries.open', recipes: 'recipes.manage', reminders: 'reminders.open', spond: 'spond.open', countdown: 'countdown.open', date: 'date.open', stocks: 'stocks.open', assistant: 'ai_follow.manage', layout: 'layout.open' }
    const capabilityId = openIds[legacy.arguments.destination]
    return capabilityId ? { capabilityId, arguments: {} } : null
  }
  return null
}

export function validateCapabilityClassification(value: unknown): CapabilityRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.capabilityId === 'unsupported' || typeof row.capabilityId !== 'string' || !ASSISTANT_CAPABILITY_IDS.includes(row.capabilityId as never) || !row.arguments || typeof row.arguments !== 'object' || Array.isArray(row.arguments)) return null
  return { capabilityId: row.capabilityId, arguments: Object.fromEntries(Object.entries(row.arguments as Record<string, unknown>).filter(([, argument]) => argument != null)) }
}
