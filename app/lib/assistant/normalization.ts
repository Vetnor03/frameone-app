import { normalizeBuiltInLayout } from '../frameLayoutTransition.ts'

const MONTHS: Record<string, number> = { january: 1, januar: 1, february: 2, februar: 2, march: 3, mars: 3, april: 4, may: 5, mai: 5, june: 6, juni: 6, july: 7, juli: 7, august: 8, september: 9, october: 10, oktober: 10, november: 11, december: 12, desember: 12 }

function localYear(localNow: string, timezone: string | null) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone || 'UTC', year: 'numeric' }).formatToParts(new Date(localNow))
  return Number(parts.find((part) => part.type === 'year')?.value)
}

export function normalizeCapabilityArgument(argument: string, value: unknown, context: { localNow: string; timezone: string | null }): unknown | null {
  if (argument === 'rating') { const rating = Number(String(value).match(/[1-6]/)?.[0]); return Number.isInteger(rating) && rating >= 1 && rating <= 6 ? rating : null }
  if (argument === 'time') { const match = String(value).trim().match(/(?:kl\.?\s*)?(\d{1,2})(?:[:.]([0-5]\d))?/i); return match && Number(match[1]) < 24 ? `${match[1].padStart(2, '0')}:${match[2] ?? '00'}` : null }
  if (argument === 'theme') { const clean = String(value).toLocaleLowerCase(); return /(?:dark|mørk|mork)/.test(clean) ? 'dark' : /(?:light|lys)/.test(clean) ? 'light' : null }
  if (argument === 'language') { const clean = String(value).toLocaleLowerCase(); return /(?:norsk|norwegian|\bno\b)/.test(clean) ? 'no' : /(?:english|engelsk|\ben\b)/.test(clean) ? 'en' : null }
  if (argument === 'layout') return normalizeBuiltInLayout(value)
  if (argument === 'date' || argument === 'period') { const clean = String(value).toLocaleLowerCase(); return /(?:yesterday|i går)/.test(clean) ? 'yesterday' : /(?:tomorrow|i morgen)/.test(clean) ? 'tomorrow' : /(?:today|i dag|now|nå)/.test(clean) ? (argument === 'period' ? 'today' : 'today') : null }
  if (argument === 'targetDate') {
    const clean = String(value).trim().toLocaleLowerCase(); if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
    const match = clean.match(/(\d{1,2})\.?\s+([\p{L}]+)/u); const month = match ? MONTHS[match[2]] : null; if (!match || !month) return null
    const year = Number(clean.match(/\b(20\d{2})\b/)?.[1] ?? localYear(context.localNow, context.timezone)); return `${year}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }
  if (argument === 'items') return Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [{ name: value.trim() }] : null
  if (typeof value === 'string') return value.trim() || null
  return value ?? null
}

export function normalizeCapabilityArguments(argumentsValue: Record<string, unknown>, context: { localNow: string; timezone: string | null }) {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(argumentsValue)) {
    if (value == null || value === '') continue
    normalized[key] = normalizeCapabilityArgument(key, value, context) ?? value
  }
  return normalized
}
