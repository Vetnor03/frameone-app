import type { AssistantDestination, ResolvedAssistantIntent } from './types'
import { capabilityById, type AssistantCapabilityId } from './capabilities.ts'
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
  return { capabilityId: 'surf.log_experience', arguments: { spot: spot.label, rating, date, ...(time ? { time: `${time[1].padStart(2, '0')}:${(time[2] || '00').padStart(2, '0')}` } : {}), comment: text.trim() } }
}

function naturalReminder(text: string) {
  const hasDate = /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|i dag|i morgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)\b/i.test(text)
  const taskLike = /^(?:call|phone|dentist|doctor|appointment|ring|tannlege|lege|møte)\b/i.test(text)
  return hasDate && taskLike ? { capabilityId: 'reminders.create' as const, arguments: { text: text.trim() } } : null
}

export function resolveDeterministicAssistantIntent(text: string): ResolvedAssistantIntent | null {
  const request = text.trim()
  if (!request || request.length > 1_000) return null
  const lower = request.toLocaleLowerCase()
  if (/(?:hvilket|which|what).*(?:fotballag|football team|soccer team).*(?:følger|follow)/i.test(request)) return { capabilityId: 'football.read', arguments: {} }
  if (/(?:hvordan|how|what).*(?:vær|weather)/i.test(request)) return { capabilityId: 'weather.read', arguments: { date: /(?:i morgen|tomorrow)/i.test(request) ? 'tomorrow' : 'today' } }
  if (/(?:hva|what).*(?:handlelist|shopping list|grocer)/i.test(request)) return { capabilityId: 'groceries.read', arguments: {} }
  if (/(?:hva|what).*(?:påminn|reminder)/i.test(request)) return { capabilityId: 'reminders.read', arguments: {} }
  if (/^(?:bytt|endre|set|switch).*(?:appen|app).*(?:dark|dark mode|mørk)/i.test(request)) return { capabilityId: 'settings.set_app_theme', arguments: { theme: 'dark' } }
  if (/^(?:bytt|endre|set|switch).*(?:appen|app).*(?:light|light mode|lys)/i.test(request)) return { capabilityId: 'settings.set_app_theme', arguments: { theme: 'light' } }
  if (/^(?:bytt|endre|set|switch).*(?:språk|language).*(?:norsk|norwegian)/i.test(request)) return { capabilityId: 'frame.set_language', arguments: { language: 'no' } }
  if (/^(?:bytt|endre|set|switch).*(?:språk|language).*(?:engelsk|english)/i.test(request)) return { capabilityId: 'frame.set_language', arguments: { language: 'en' } }
  const layout = request.match(/(?:layout|oppsett)\s*(?:nummer\s*)?([1-4])\b/i)
  if (layout && /\b(?:bytt|endre|set|switch|velg)\b/i.test(request)) return { capabilityId: 'frame.set_layout', arguments: { layout: ['default', 'pyramid', 'square', 'full'][Number(layout[1]) - 1] } }
  if (/^(?:lag|create|make)\s+(?:en\s+|a\s+)?(?:nedtelling|countdown)/i.test(request)) {
    const dateMatch = lower.match(/\b(\d{1,2})[.\s]+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|january|february|march|may|june|july|october|december)\b/i)
    const months = ['januar january', 'februar february', 'mars march', 'april', 'mai may', 'juni june', 'juli july', 'august', 'september', 'oktober october', 'november', 'desember december']
    const date = dateMatch ? `${new Date().getUTCFullYear()}-${String(months.findIndex((month) => month.includes(dateMatch[2])) + 1).padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}` : undefined
    const title = request.replace(/^(?:lag|create|make)\s+(?:en\s+|a\s+)?(?:nedtelling|countdown)(?:\s+(?:til|for))?\s*/i, '').replace(/\s+\d{1,2}[.\s]+\p{L}+.*$/u, '').trim() || undefined
    return { capabilityId: 'countdown.create', arguments: { title, date } }
  }
  const requestedSpot = Object.values(SURF_SPOTS).find((candidate) => lower.includes(candidate.label.toLocaleLowerCase()))
  if (requestedSpot && /(?:hvordan|how|forhold|conditions|i morgen|tomorrow)/i.test(request)) return { capabilityId: 'surf.read', arguments: { spot: requestedSpot.label, spotId: requestedSpot.spotId, date: /(?:i morgen|tomorrow)/i.test(request) ? 'tomorrow' : 'today' } }
  // Resolve against the same team catalogue as the Football picker. This is
  // data-driven: adding a team to the UI automatically makes it addressable.
  if (/\b(?:change|switch|set|bytt|endre|velg)\b/i.test(request) && /(?:football|soccer|fotball|team|lag)/i.test(request)) {
    const normalized = request.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    const team = [...ALL_TEAMS].sort((a, b) => b.teamName.length - a.teamName.length).find((candidate) => {
      const words = candidate.teamName.split(/\s+/)
      const names = [candidate.teamName, candidate.teamId.replaceAll('_', ' '), ...(words.length > 1 ? [words.at(-1)!] : [])]
      return names.some((name) => normalized.includes(name.toLocaleLowerCase()))
    })
    if (team) return { capabilityId: 'football.set_team', arguments: { team: team.teamName, ...team } }
    return { capabilityId: 'football.set_team', arguments: {} }
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
  if (module) return null
  for (const entry of HELP) {
    if (entry.pattern.test(request) && /(?:where|how|open|find|change|connect|koble|hvor|hvordan)/i.test(request)) {
      return null
    }
  }
  const items = groceryItems(request)
  if (items) return { capabilityId: 'groceries.add', arguments: { items } }
  if (/^(?:(?:please\s+)?remind me|minn meg på)\s+/i.test(request)) return { capabilityId: 'reminders.create', arguments: { text: request } }
  const surf = surfExperience(request)
  if (surf) return surf
  const reminder = naturalReminder(request)
  if (reminder) return reminder
  const shorthandItems = shorthandGroceryItems(request)
  return shorthandItems ? { capabilityId: 'groceries.add', arguments: { items: shorthandItems } } : null
}

export function validateModelIntent(value: unknown): ResolvedAssistantIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.capabilityId !== 'string' || !capabilityById(input.capabilityId)) return null
  const args = input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments) ? input.arguments as Record<string, unknown> : {}
  return { capabilityId: input.capabilityId as AssistantCapabilityId, arguments: args }
}
