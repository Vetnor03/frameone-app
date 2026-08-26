export const REMINDER_PARSE_VERSION = 'reminder-parse-v3'
export const REMINDER_PARSE_TIMEOUT_MS = 15_000

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

function normalizedClarificationText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[.,!?]+$/g, '').replace(/\s+/g, ' ')
}

function isScheduleOnlyClarification(value: string) {
  return /^(?:(?:kl(?:okken)?\.?\s*)?(?:[01]?\d|2[0-3])(?::[0-5]\d)?(?:\s+i kveld)?|(?:seks|seven|sju|åtte|ni|ti|elleve|tolv)(?:\s+i kveld)?|(?:i dag|today|i morgen|tomorrow)|(?:mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2})$/i.test(value)
}

function mergeExistingReminder(existing: ParsedReminder | undefined, candidate: unknown, clarificationAnswer?: string) {
  if (!existing || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate
  const next = candidate as Record<string, unknown>
  const candidateTitle = typeof next.title === 'string' ? normalizedClarificationText(next.title) : ''
  const answer = clarificationAnswer ? normalizedClarificationText(clarificationAnswer) : ''
  const titleWasReplacedByAnswer = Boolean(answer && candidateTitle === answer && isScheduleOnlyClarification(answer))
  // Structured context is authoritative until the user/model supplies a new value.
  // A normalized semantic title may legitimately change after a clarification. Only
  // restore it when the model has clearly mistaken the clarification answer for the title.
  return Object.fromEntries(Object.keys(next).map((key) => [
    key,
    (titleWasReplacedByAnswer && key === 'title') || ((next[key] === null || next[key] === undefined) && existing[key as keyof ParsedReminder] != null)
      ? existing[key as keyof ParsedReminder]
      : next[key],
  ]))
}

const YMD = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/
const HM = /^([01]\d|2[0-3]):[0-5]\d$/
const reminderKeys = new Set(['title', 'due_date', 'due_time', 'end_date', 'end_time', 'repeat_type', 'custom_repeat_days', 'tag', 'ambiguities'])
const resultKeys = new Set(['reminder', 'missing_fields', 'question'])

function isRealYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !YMD.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function inferRecurringReminderStartDate(reminder: ParsedReminder, localNow: string, timezone: string | null | undefined): ParsedReminder {
  if (reminder.repeat_type !== 'daily' || reminder.due_date || !reminder.due_time) return reminder
  const now = new Date(localNow)
  if (Number.isNaN(now.getTime())) return reminder
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
    const year = Number(part('year')), month = Number(part('month')), day = Number(part('day'))
    const localTime = `${part('hour')}:${part('minute')}`
    if (!year || !month || !day || !HM.test(localTime)) return reminder
    const localDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (localTime <= reminder.due_time) return { ...reminder, due_date: localDate }
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1))
    return { ...reminder, due_date: tomorrow.toISOString().slice(0, 10) }
  } catch {
    return reminder
  }
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

function clarificationFallback(missing: Array<typeof REMINDER_MISSING_FIELDS[number]>, language: ReminderParseContext['language']) {
  const missingDate = missing.includes('due_date')
  const missingTime = missing.includes('due_time')
  if (language === 'no') {
    if (missingDate && missingTime) return 'Når skal jeg minne deg på det?'
    return missingDate ? 'Hvilken dag?' : 'Når på dagen?'
  }
  if (missingDate && missingTime) return 'When should I remind you?'
  return missingDate ? 'Which day?' : 'What time?'
}

export function validateReminderParseResult(value: unknown, language: ReminderParseContext['language'] = 'en'): ReminderParseResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some((key) => !resultKeys.has(key)) || !Array.isArray(v.missing_fields)) return null
  const reminder = validateParsedReminder(v.reminder)
  if (!reminder || !v.missing_fields.every((x) => (REMINDER_MISSING_FIELDS as readonly unknown[]).includes(x))) return null
  const missing = [...new Set(v.missing_fields)] as Array<typeof REMINDER_MISSING_FIELDS[number]>
  // A date is the only universally required scheduling field. The model may also
  // request a time when the wording implies one but is unsafe to resolve.
  if (!reminder.due_date && !missing.includes('due_date')) missing.unshift('due_date')
  if (reminder.due_date && missing.includes('due_date')) return null
  if (missing.includes('due_time') && reminder.due_time !== null) return null
  if (!missing.length) {
    if (!reminder.due_date || v.question !== null) return null
    return { status: 'ready', reminder, partial: null, missing_fields: [], question: null }
  }
  const modelQuestion = typeof v.question === 'string' ? v.question.trim() : ''
  const question = modelQuestion && modelQuestion.length <= 240 ? modelQuestion : clarificationFallback(missing, language)
  return { status: 'needs_clarification', reminder: null, partial: reminder, missing_fields: missing, question }
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
    reminder: reminderSchema,
    missing_fields: { type: 'array', items: { type: 'string', enum: [...REMINDER_MISSING_FIELDS] } },
    question: nullable({ type: 'string', minLength: 1, maxLength: 240 }),
  },
  required: ['reminder', 'missing_fields', 'question'],
}

function logParseFailure(reason: string, details?: { status: number }) {
  // Keep this deliberately structured and free of request/model content and identifiers.
  console.error(reason, details || {})
}

function logParseCompleted(durationMs: number, outcome: ReminderParseResult['status']) {
  // Timing telemetry must never include request/model output or user identifiers.
  console.info('reminder_parse_completed', { duration_ms: durationMs, outcome })
}

export async function parseReminder(context: ReminderParseContext, fetcher: typeof fetch = fetch): Promise<ReminderParseResult | null> {
  if (!process.env.OPENAI_API_KEY || !context.text.trim() || !Date.parse(context.localNow)) {
    logParseFailure('reminder_parse_validation_error')
    return null
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMINDER_PARSE_TIMEOUT_MS)
  const requestStartedAt = Date.now()
  try {
    const response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.REMINDER_PARSE_MODEL || 'gpt-5-mini', store: false,
        reasoning: { effort: 'minimal' },
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: `Parse or complete a reminder in the existing RE:MIND schema. Version: ${REMINDER_PARSE_VERSION}. Always return exactly one reminder candidate plus missing_fields and question; never decide a status. Resolve relative dates only from localNow and timezone. Never invent a date, clock time, end, tag, person, place, or repeat rule. Treat every non-null field in existing_partial as already supplied structured context. Preserve it unless the user's current text or clarification answer explicitly changes that field. A clarification answer is additive: fill or modify what the question asks without clearing unrelated fields. due_date is required; due_time is generally optional. Put due_date in missing_fields whenever it is unknown. If wording clearly implies a time that is too vague to represent safely (for example later, after work, or an undefined evening), also put due_time in missing_fields. When missing_fields is non-empty, provide one calm, concise question written naturally in the requested language; otherwise question must be null.\n\nCanonical title normalization: the title is the semantic reminder content, not a frame-optimized short label. Remove date, start-time, end-time, and recurrence wording only when that exact information was successfully represented in the corresponding structured field. Keep all unrepresented or meaningful content. Thus Norwegian equivalents of “Ring mamma på torsdag” and “Ring mamma torsdag kl. 18” become “Ring mamma” when their date/time fields are resolved, while “Ring mamma om bursdagen hennes på torsdag” keeps “om bursdagen hennes” and “Møte på kontoret torsdag” keeps “på kontoret”. Do not rewrite manually created reminders; this parser only normalizes the current natural-language request. Any meaningful information unsupported by structured fields remains in title. end_date/end_time describe this occurrence, never recurrence termination. Sunday recurrence is weekly with a Sunday due_date. custom_repeat_days is only for an explicit every-N-days rule. ambiguities may describe non-blocking unsupported intent.` }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ original_reminder_text: context.text.trim(), existing_partial: context.partial, clarification_question: context.clarificationQuestion, clarification_answer: context.clarificationAnswer, localNow: context.localNow, timezone: context.timezone || null, language: context.language }) }] },
        ],
        text: { format: { type: 'json_schema', name: 'reminder_parse', strict: true, schema: reminderParseJsonSchema } }, max_output_tokens: 450,
      }),
    })
    if (!response.ok) {
      logParseFailure('reminder_parse_openai_http_error', { status: response.status })
      return null
    }
    const payload = await response.json()
    let decoded: unknown
    try { decoded = JSON.parse(outputText(payload)) } catch {
      logParseFailure('reminder_parse_invalid_json')
      return null
    }
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      const output = decoded as Record<string, unknown>
      output.reminder = mergeExistingReminder(context.partial, output.reminder, context.clarificationAnswer)
      if (output.reminder && typeof output.reminder === 'object' && !Array.isArray(output.reminder)) {
        const validatedReminder = validateParsedReminder(output.reminder)
        if (validatedReminder) output.reminder = inferRecurringReminderStartDate(validatedReminder, context.localNow, context.timezone)
        const reminder = output.reminder as Record<string, unknown>
        if (reminder.due_date != null && Array.isArray(output.missing_fields)) {
          output.missing_fields = output.missing_fields.filter((field) => field !== 'due_date')
        }
        if (reminder.due_time != null && Array.isArray(output.missing_fields)) {
          output.missing_fields = output.missing_fields.filter((field) => field !== 'due_time')
        }
        if (Array.isArray(output.missing_fields) && output.missing_fields.length === 0) output.question = null
      }
    }
    const result = validateReminderParseResult(decoded, context.language)
    if (!result) logParseFailure('reminder_parse_invalid_result')
    else logParseCompleted(Date.now() - requestStartedAt, result.status)
    return result
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) logParseFailure('reminder_parse_timeout')
    else logParseFailure('reminder_parse_openai_error')
    return null
  } finally { clearTimeout(timeout) }
}
