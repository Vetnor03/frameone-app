export const REMINDER_PARSE_VERSION = 'reminder-parse-v1'
export const REMINDER_PARSE_TIMEOUT_MS = 10_000

export const REMINDER_REPEAT_TYPES = ['none', 'daily', 'weekly', '2weeks', '4weeks', 'monthly', 'halfyear', 'yearly', '2years', 'custom'] as const
export const REMINDER_TAGS = ['work', 'personal', 'sports', 'chores', 'event'] as const

export type ParsedReminder = {
  title: string
  due_date: string | null
  due_time: string | null
  end_date: string | null
  end_time: string | null
  all_day: boolean
  repeat_type: typeof REMINDER_REPEAT_TYPES[number]
  custom_repeat_days: number | null
  tag: typeof REMINDER_TAGS[number] | null
  note: string | null
  ambiguities: string[]
}

export type ReminderParseContext = {
  text: string
  localNow: string
  timezone?: string | null
  language: 'en' | 'no'
}

const YMD = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const allowedKeys = new Set(['title', 'due_date', 'due_time', 'end_date', 'end_time', 'all_day', 'repeat_type', 'custom_repeat_days', 'tag', 'note', 'ambiguities'])

export function validateParsedReminder(value: unknown): ParsedReminder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some((key) => !allowedKeys.has(key))) return null
  const nullableMatch = (x: unknown, pattern: RegExp) => x === null || (typeof x === 'string' && pattern.test(x))
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.trim().length > 500) return null
  if (!nullableMatch(v.due_date, YMD) || !nullableMatch(v.end_date, YMD) || !nullableMatch(v.due_time, HM) || !nullableMatch(v.end_time, HM)) return null
  if (typeof v.all_day !== 'boolean' || !(REMINDER_REPEAT_TYPES as readonly unknown[]).includes(v.repeat_type)) return null
  if (v.custom_repeat_days !== null && (!Number.isInteger(v.custom_repeat_days) || Number(v.custom_repeat_days) < 1)) return null
  if (v.repeat_type === 'custom' && v.custom_repeat_days === null) return null
  if (v.repeat_type !== 'custom' && v.custom_repeat_days !== null) return null
  if (v.tag !== null && !(REMINDER_TAGS as readonly unknown[]).includes(v.tag)) return null
  if (v.note !== null && typeof v.note !== 'string') return null
  if (!Array.isArray(v.ambiguities) || !v.ambiguities.every((x) => typeof x === 'string' && x.length <= 240)) return null
  if (v.end_date && !v.due_date) return null
  if (v.end_date && v.due_date && v.end_date < v.due_date) return null
  const effectiveEndDate = v.end_date || v.due_date
  if (v.end_time && !effectiveEndDate) return null
  if (effectiveEndDate === v.due_date && v.due_time && v.end_time && v.end_time < v.due_time) return null
  return { ...v, title: v.title.trim() } as ParsedReminder
}

function outputText(payload: any) {
  for (const item of payload?.output ?? []) for (const content of item?.content ?? []) {
    if (content?.type === 'output_text' && typeof content.text === 'string') return content.text
  }
  return ''
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
export const reminderParseJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    due_date: nullable({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    due_time: nullable({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
    end_date: nullable({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
    end_time: nullable({ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }),
    all_day: { type: 'boolean' },
    repeat_type: { type: 'string', enum: [...REMINDER_REPEAT_TYPES] },
    custom_repeat_days: nullable({ type: 'integer', minimum: 1 }),
    tag: nullable({ type: 'string', enum: [...REMINDER_TAGS] }),
    note: nullable({ type: 'string' }),
    ambiguities: { type: 'array', items: { type: 'string', maxLength: 240 } },
  },
  required: ['title', 'due_date', 'due_time', 'end_date', 'end_time', 'all_day', 'repeat_type', 'custom_repeat_days', 'tag', 'note', 'ambiguities'],
}

export async function parseReminder(context: ReminderParseContext, fetcher: typeof fetch = fetch): Promise<ParsedReminder | null> {
  if (!process.env.OPENAI_API_KEY || !context.text.trim() || !Date.parse(context.localNow)) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMINDER_PARSE_TIMEOUT_MS)
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.REMINDER_PARSE_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini',
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: `Parse a reminder into the existing RE:MIND schema. Version: ${REMINDER_PARSE_VERSION}. Resolve relative dates only from localNow and timezone supplied by the user. Preserve the meaningful title; do not shorten it. Never invent a date, exact time, end, tag, note, person, place, or repeat rule. For vague words such as later/afternoon, leave unsupported precise fields null and add a concise ambiguity. end_date/end_time describe this occurrence; they are never recurrence termination. The app represents Sunday recurrence as weekly with a Sunday due_date. Unsupported intent belongs in ambiguities. all_day means no explicit clock time. custom_repeat_days is only for an explicit every-N-days rule.` }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ text: context.text.trim(), localNow: context.localNow, timezone: context.timezone || null, language: context.language }) }] },
        ],
        text: { format: { type: 'json_schema', name: 'reminder_parse', strict: true, schema: reminderParseJsonSchema } },
        max_output_tokens: 900,
      }),
    })
    if (!response.ok) return null
    const raw = outputText(await response.json())
    return validateParsedReminder(JSON.parse(raw))
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
