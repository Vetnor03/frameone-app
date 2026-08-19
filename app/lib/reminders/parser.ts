export const REMINDER_PARSE_VERSION = 'reminder-parse-v2'
export const REMINDER_PARSE_TIMEOUT_MS = 10_000

export const REMINDER_REPEAT_TYPES = ['none', 'daily', 'weekly', '2weeks', '4weeks', 'monthly', 'halfyear', 'yearly', '2years', 'custom'] as const
export const REMINDER_TAGS = ['work', 'personal', 'sports', 'chores', 'event'] as const
export const REMINDER_MISSING_FIELDS = ['due_date', 'due_time'] as const

export type ParsedReminder = {
  title: string
  due_date: string | null
  due_time: string | null
  end_date: string | null
  end_time: string | null
  repeat_type: typeof REMINDER_REPEAT_TYPES[number]
  custom_repeat_days: number | null
  tag: typeof REMINDER_TAGS[number] | null
  ambiguities: string[]
}

export type ReminderParseResult =
  | { status: 'ready'; reminder: ParsedReminder; partial: null; missing_fields: []; question: null }
  | { status: 'needs_clarification'; reminder: null; partial: ParsedReminder; missing_fields: Array<typeof REMINDER_MISSING_FIELDS[number]>; question: string }

export type ReminderParseContext = {
  text: string
  localNow: string
  timezone?: string | null
  language: 'en' | 'no'
  partial?: ParsedReminder
  clarificationQuestion?: string
  clarificationAnswer?: string
}

const YMD = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const reminderKeys = new Set(['title', 'due_date', 'due_time', 'end_date', 'end_time', 'repeat_type', 'custom_repeat_days', 'tag', 'ambiguities'])
const resultKeys = new Set(['status', 'reminder', 'partial', 'missing_fields', 'question'])

function isRealYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !YMD.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function validateParsedReminder(value: unknown): ParsedReminder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some((key) => !reminderKeys.has(key))) return null
  const nullableMatch = (x: unknown, pattern: RegExp) => x === null || (typeof x === 'string' && pattern.test(x))
  const nullableRealYmd = (x: unknown) => x === null || isRealYmd(x)
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.trim().length > 500) return null
  if (!nullableRealYmd(v.due_date) || !nullableRealYmd(v.end_date) || !nullableMatch(v.due_time, HM) || !nullableMatch(v.end_time, HM)) return null
  if (!(REMINDER_REPEAT_TYPES as readonly unknown[]).includes(v.repeat_type)) return null
  if (v.custom_repeat_days !== null && (!Number.isInteger(v.custom_repeat_days) || Number(v.custom_repeat_days) < 1)) return null
  if (v.repeat_type === 'custom' && v.custom_repeat_days === null) return null
  if (v.repeat_type !== 'custom' && v.custom_repeat_days !== null) return null
  if (v.tag !== null && !(REMINDER_TAGS as readonly unknown[]).includes(v.tag)) return null
  if (!Array.isArray(v.ambiguities) || !v.ambiguities.every((x) => typeof x === 'string' && x.length <= 240)) return null
  if (v.end_date && !v.due_date) return null
  if (v.end_date && v.due_date && v.end_date < v.due_date) return null
  const effectiveEndDate = v.end_date || v.due_date
  if (v.end_time && !effectiveEndDate) return null
  if (effectiveEndDate === v.due_date && v.due_time && v.end_time && v.end_time < v.due_time) return null
  return { ...v, title: v.title.trim() } as ParsedReminder
}

export function validateReminderParseResult(value: unknown): ReminderParseResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some((key) => !resultKeys.has(key)) || !Array.isArray(v.missing_fields)) return null
  if (v.status === 'ready') {
    const reminder = validateParsedReminder(v.reminder)
    if (!reminder?.due_date || v.partial !== null || v.question !== null || v.missing_fields.length) return null
    return { status: 'ready', reminder, partial: null, missing_fields: [], question: null }
  }
  if (v.status === 'needs_clarification') {
    const partial = validateParsedReminder(v.partial)
    const missing = v.missing_fields
    if (v.reminder !== null || !partial || typeof v.question !== 'string' || !v.question.trim() || !missing.length || !missing.every((x) => (REMINDER_MISSING_FIELDS as readonly unknown[]).includes(x))) return null
    if (missing.includes('due_date') !== (partial.due_date === null) || (missing.includes('due_time') && partial.due_time !== null)) return null
    return { status: 'needs_clarification', reminder: null, partial, missing_fields: [...new Set(missing)] as Array<typeof REMINDER_MISSING_FIELDS[number]>, question: v.question.trim() }
  }
  return null
}

function outputText(payload: any) {
  for (const item of payload?.output ?? []) for (const content of item?.content ?? []) {
    if (content?.type === 'output_text' && typeof content.text === 'string') return content.text
  }
  return ''
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const reminderSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    due_date: nullable({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    due_time: nullable({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
    end_date: nullable({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    end_time: nullable({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
    repeat_type: { type: 'string', enum: [...REMINDER_REPEAT_TYPES] },
    custom_repeat_days: nullable({ type: 'integer', minimum: 1 }),
    tag: nullable({ type: 'string', enum: [...REMINDER_TAGS] }),
    ambiguities: { type: 'array', items: { type: 'string', maxLength: 240 } },
  },
  required: ['title', 'due_date', 'due_time', 'end_date', 'end_time', 'repeat_type', 'custom_repeat_days', 'tag', 'ambiguities'],
}
export const reminderParseJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ready', 'needs_clarification'] },
    reminder: nullable(reminderSchema), partial: nullable(reminderSchema),
    missing_fields: { type: 'array', items: { type: 'string', enum: [...REMINDER_MISSING_FIELDS] } },
    question: nullable({ type: 'string', minLength: 1, maxLength: 240 }),
  },
  required: ['status', 'reminder', 'partial', 'missing_fields', 'question'],
}

export async function parseReminder(context: ReminderParseContext, fetcher: typeof fetch = fetch): Promise<ReminderParseResult | null> {
  if (!process.env.OPENAI_API_KEY || !context.text.trim() || !Date.parse(context.localNow)) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMINDER_PARSE_TIMEOUT_MS)
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.REMINDER_PARSE_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini', store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: `Parse or complete a reminder in the existing RE:MIND schema. Version: ${REMINDER_PARSE_VERSION}. Resolve relative dates only from localNow and timezone. Never invent a date, clock time, end, tag, person, place, or repeat rule. Return ready only when due_date is known; an exact due_time is optional. If understandable scheduling language is too vague to safely produce a required date or an explicitly implied time (for example later or after work), return needs_clarification with the useful partial, precisely missing fields, and one calm, specific question written naturally in the requested language. Preserve any previously parsed fields when completing a clarification and use the answer only to fill or correct what it addresses.\n\nCanonical title normalization: the title is the semantic reminder content, not a frame-optimized short label. Remove date, start-time, end-time, and recurrence wording only when that exact information was successfully represented in the corresponding structured field. Keep all unrepresented or meaningful content. Thus Norwegian equivalents of “Ring mamma på torsdag” and “Ring mamma torsdag kl. 18” become “Ring mamma” when their date/time fields are resolved, while “Ring mamma om bursdagen hennes på torsdag” keeps “om bursdagen hennes” and “Møte på kontoret torsdag” keeps “på kontoret”. Do not rewrite manually created reminders; this parser only normalizes the current natural-language request. Any meaningful information unsupported by structured fields remains in title. end_date/end_time describe this occurrence, never recurrence termination. Sunday recurrence is weekly with a Sunday due_date. custom_repeat_days is only for an explicit every-N-days rule. ambiguities may describe non-blocking unsupported intent; missing required scheduling data must use needs_clarification instead.` }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ original_reminder_text: context.text.trim(), existing_partial: context.partial, clarification_question: context.clarificationQuestion, clarification_answer: context.clarificationAnswer, localNow: context.localNow, timezone: context.timezone || null, language: context.language }) }] },
        ],
        text: { format: { type: 'json_schema', name: 'reminder_parse', strict: true, schema: reminderParseJsonSchema } }, max_output_tokens: 1200,
      }),
    })
    if (!response.ok) return null
    return validateReminderParseResult(JSON.parse(outputText(await response.json())))
  } catch { return null } finally { clearTimeout(timeout) }
}
