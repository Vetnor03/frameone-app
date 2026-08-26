import type { CapabilityArgument } from './capabilities.ts'

const MONTHS: Record<string, number> = { january:1, januar:1, february:2, februar:2, march:3, mars:3, april:4, may:5, mai:5, june:6, juni:6, july:7, juli:7, august:8, september:9, october:10, oktober:10, november:11, december:12, desember:12 }
function pad(value: number) { return String(value).padStart(2, '0') }

export function normalizeAssistantDate(value: unknown, localNow: string, timezone: string | null): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().toLocaleLowerCase().replace(/[.,]$/u, '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean) && !Number.isNaN(Date.parse(`${clean}T00:00:00Z`))) return clean
  const nowParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(localNow)).map((part) => [part.type, part.value]))
  const today = new Date(`${nowParts.year}-${nowParts.month}-${nowParts.day}T00:00:00Z`)
  if (/^(today|i dag)$/.test(clean)) return today.toISOString().slice(0, 10)
  if (/^(tomorrow|i morgen)$/.test(clean)) { today.setUTCDate(today.getUTCDate() + 1); return today.toISOString().slice(0, 10) }
  const match = clean.match(/^(\d{1,2})\.?\s+([\p{L}]+)(?:\s+(\d{4}))?$/u)
  const month = match && MONTHS[match[2]]
  if (!match || !month) return null
  let year = match[3] ? Number(match[3]) : Number(nowParts.year)
  const candidate = `${year}-${pad(month)}-${pad(Number(match[1]))}`
  if (!match[3] && candidate < `${nowParts.year}-${nowParts.month}-${nowParts.day}`) year += 1
  const result = `${year}-${pad(month)}-${pad(Number(match[1]))}`
  return Number.isNaN(Date.parse(`${result}T00:00:00Z`)) ? null : result
}

export function normalizeCapabilityArgument(argument: CapabilityArgument, value: unknown, context: { localNow: string; timezone: string | null }): unknown {
  const clean = typeof value === 'string' ? value.trim() : value
  if (argument === 'targetDate') return normalizeAssistantDate(clean, context.localNow, context.timezone)
  if (argument === 'rating') { const number = Number(String(clean).match(/[1-6]/)?.[0]); return Number.isInteger(number) ? number : null }
  if (argument === 'time' && typeof clean === 'string') { const match = clean.match(/(?:kl\.?|at|rundt|around)?\s*(\d{1,2})(?:(?::|\.)(\d{2}))?/i); return match && Number(match[1]) < 24 && Number(match[2] || 0) < 60 ? `${pad(Number(match[1]))}:${pad(Number(match[2] || 0))}` : null }
  if (argument === 'theme' && typeof clean === 'string') { if (/^(dark|dark mode|mørk|mørkt)$/i.test(clean)) return 'dark'; if (/^(light|light mode|lys|lyst)$/i.test(clean)) return 'light'; return null }
  if (argument === 'language' && typeof clean === 'string') { if (/^(no|norwegian|norsk)$/i.test(clean)) return 'no'; if (/^(en|english|engelsk)$/i.test(clean)) return 'en'; return null }
  if (argument === 'layout' && typeof clean === 'string') { const key = clean.toLowerCase().replace(/^layout\s*/, ''); return ({ '1':'default', default:'default', '2':'pyramid', pyramid:'pyramid', '3':'square', square:'square', '4':'full', full:'full' } as Record<string,string>)[key] ?? null }
  if (argument === 'date' && typeof clean === 'string') { if (/^(today|i dag)$/i.test(clean)) return 'today'; if (/^(yesterday|i går)$/i.test(clean)) return 'yesterday'; return null }
  return clean
}
