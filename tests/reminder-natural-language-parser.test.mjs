import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseReminder, reminderParseJsonSchema, validateParsedReminder, validateReminderParseResult, REMINDER_PARSE_VERSION } from '../app/lib/reminders/parser.ts'

const originalKey = process.env.OPENAI_API_KEY
process.env.OPENAI_API_KEY = 'test-key'

const base = { title: 'Dentist', due_date: '2026-08-25', due_time: '14:30', end_date: null, end_time: null, repeat_type: 'none', custom_repeat_days: null, tag: null, ambiguities: [] }
const ready = (reminder) => ({ status: 'ready', reminder, partial: null, missing_fields: [], question: null })
const clarify = (partial, missing_fields = ['due_date', 'due_time'], question = 'Når skal jeg minne deg på det?') => ({ status: 'needs_clarification', reminder: null, partial, missing_fields, question })
const candidate = (reminder, missing_fields = [], question = null) => ({ reminder, missing_fields, question })
const responseFor = (result, inspect) => async (_url, options) => {
  const request = JSON.parse(options.body)
  assert.equal(request.store, false)
  assert.deepEqual(request.reasoning, { effort: 'minimal' })
  assert.equal(request.max_output_tokens, 450)
  assert.equal(request.input[1].content[0].text.includes('2026-08-19T10:00:00'), true)
  inspect?.(JSON.parse(request.input[1].content[0].text))
  return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }), { status: 200 })
}
const context = (text, language = 'en') => ({ text, language, localNow: '2026-08-19T10:00:00+02:00', timezone: 'Europe/Oslo' })

for (const [name, text, language, reminder] of [
  ['explicit date/time', 'Dentist 25 August at 14:30', 'en', base],
  ['relative date', 'Dentist tomorrow at 14:30', 'en', { ...base, due_date: '2026-08-20' }],
  ['Norwegian relative date', 'Tannlege i morgen kl. 14:30', 'no', { ...base, title: 'Tannlege', due_date: '2026-08-20' }],
  ['unsupported detail remains in title', 'Dentist tomorrow at 14:30, remember insurance card', 'en', { ...base, title: 'Dentist, remember insurance card', due_date: '2026-08-20' }],
  ['weekly recurrence', 'Ta ut søpla hver søndag', 'no', { ...base, title: 'Ta ut søpla', due_date: '2026-08-23', due_time: null, repeat_type: 'weekly' }],
  ['same-day time range', 'Konferanse fredag fra 10 til 15', 'no', { ...base, title: 'Konferanse', due_date: '2026-08-21', due_time: '10:00', end_date: '2026-08-21', end_time: '15:00' }],
  ['multi-day range', 'Trip to Bergen 5–7 September', 'en', { ...base, title: 'Trip to Bergen', due_date: '2026-09-05', due_time: null, end_date: '2026-09-07' }],
  ['clean Thursday title', 'Ring mamma på torsdag', 'no', { ...base, title: 'Ring mamma', due_date: '2026-08-20', due_time: null }],
  ['clean Thursday and time title', 'Ring mamma torsdag kl. 18', 'no', { ...base, title: 'Ring mamma', due_date: '2026-08-20', due_time: '18:00' }],
  ['meaningful relationship phrase retained', 'Ring mamma om bursdagen hennes på torsdag', 'no', { ...base, title: 'Ring mamma om bursdagen hennes', due_date: '2026-08-20', due_time: null }],
  ['location phrase retained', 'Møte på kontoret torsdag', 'no', { ...base, title: 'Møte på kontoret', due_date: '2026-08-20', due_time: null }],
  ['date without time is ready', 'Møte fredag', 'no', { ...base, title: 'Møte', due_date: '2026-08-21', due_time: null }],
]) test(name, async () => assert.deepEqual(await parseReminder(context(text, language), responseFor(candidate(reminder))), ready(reminder)))

for (const [name, text, partial, missing] of [
  ['after work asks when without invention', 'Hent Siri etter jobb', { ...base, title: 'Hent Siri', due_date: null, due_time: null }, ['due_date', 'due_time']],
  ['later asks when without invention', 'Ring pappa senere', { ...base, title: 'Ring pappa', due_date: null, due_time: null }, ['due_date', 'due_time']],
  ['known time asks only for date', 'Tannlege kl. 14:30', { ...base, title: 'Tannlege', due_date: null, due_time: '14:30' }, ['due_date']],
]) test(name, async () => {
  const expected = clarify(partial, missing)
  assert.deepEqual(await parseReminder(context(text, 'no'), responseFor(candidate(partial, missing, expected.question))), expected)
})

test('clarification sends original, partial, question, and answer and can become ready', async () => {
  const partial = { ...base, title: 'Hent Siri', due_date: null, due_time: null }
  const reminder = { ...partial, due_date: '2026-08-19', due_time: '16:00' }
  const ctx = { ...context('Hent Siri etter jobb', 'no'), partial, clarificationQuestion: 'Når skal jeg minne deg på det?', clarificationAnswer: 'I dag kl. 16' }
  const result = await parseReminder(ctx, responseFor(candidate(reminder), (payload) => {
    assert.equal(payload.original_reminder_text, ctx.text)
    assert.deepEqual(payload.existing_partial, partial)
    assert.equal(payload.clarification_question, ctx.clarificationQuestion)
    assert.equal(payload.clarification_answer, ctx.clarificationAnswer)
  }))
  assert.deepEqual(result, ready(reminder))
})

test('selected date survives a title followed by a time-only clarification', async () => {
  const partial = { ...base, title: 'Besøk farmor', due_date: '2026-08-22', due_time: null }
  const ctx = { ...context('Besøk farmor', 'no'), partial, clarificationQuestion: 'Når på dagen?', clarificationAnswer: '18:00' }
  const modelCandidate = { ...partial, title: '18:00', due_date: null, due_time: '18:00' }
  assert.deepEqual(await parseReminder(ctx, responseFor(candidate(modelCandidate))), ready({ ...partial, due_time: '18:00' }))
})

test('time clarification allows a legitimately normalized title while preserving the selected date', async () => {
  const partial = { ...base, title: 'Besøk farmor i kveld', due_date: '2026-08-22', due_time: null }
  const ctx = { ...context('Besøk farmor i kveld', 'no'), partial, clarificationQuestion: 'Når på kvelden?', clarificationAnswer: '18:00' }
  const normalized = { ...partial, title: 'Besøk farmor', due_date: null, due_time: '18:00' }
  assert.deepEqual(
    await parseReminder(ctx, responseFor(candidate(normalized))),
    ready({ ...normalized, due_date: '2026-08-22' }),
  )
})

test('time clarification rejects the answer as a replacement title while preserving the selected date', async () => {
  const partial = { ...base, title: 'Besøk farmor', due_date: '2026-08-22', due_time: null }
  const ctx = { ...context('Besøk farmor', 'no'), partial, clarificationQuestion: 'Når på dagen?', clarificationAnswer: '18:00' }
  const badCandidate = { ...partial, title: '18:00', due_date: null, due_time: '18:00' }
  assert.deepEqual(
    await parseReminder(ctx, responseFor(candidate(badCandidate))),
    ready({ ...partial, due_time: '18:00' }),
  )
})

test('selected date is structured context when the original title includes a time', async () => {
  const partial = { ...base, title: 'Besøk farmor kl. 18', due_date: '2026-08-22', due_time: null }
  const reminder = { ...partial, title: 'Besøk farmor', due_time: '18:00' }
  const ctx = { ...context('Besøk farmor kl. 18', 'no'), partial }
  assert.deepEqual(await parseReminder(ctx, responseFor(candidate(reminder), (payload) => {
    assert.equal(payload.existing_partial.due_date, '2026-08-22')
  })), ready(reminder))
})

test('without a selected date the parser still asks for the missing date today as before', async () => {
  const partial = { ...base, title: 'Besøk farmor', due_date: null, due_time: null }
  assert.deepEqual(
    await parseReminder(context('Besøk farmor', 'no'), responseFor(candidate(partial, ['due_date'], 'Hvilken dag?'))),
    clarify(partial, ['due_date'], 'Hvilken dag?'),
  )
})

test('a later explicit date overrides the existing selected date', async () => {
  const partial = { ...base, title: 'Besøk farmor', due_date: '2026-08-22', due_time: null }
  const changed = { ...partial, due_date: '2026-08-23' }
  const ctx = { ...context('Besøk farmor', 'no'), partial, clarificationQuestion: 'Når på dagen?', clarificationAnswer: 'I morgen i stedet' }
  assert.deepEqual(await parseReminder(ctx, responseFor(candidate(changed))), ready(changed))
})

test('time-only follow-up cannot clear an existing date or title', async () => {
  const partial = { ...base, title: 'Besøk farmor', due_date: '2026-08-22', due_time: null }
  for (const answer of ['18', 'kl 18', 'klokken 18', 'seks', '6 i kveld']) {
    const ctx = { ...context('Besøk farmor', 'no'), partial, clarificationQuestion: 'Når på dagen?', clarificationAnswer: answer }
    const incompleteModelCandidate = { ...partial, title: answer, due_date: null, due_time: '18:00' }
    assert.deepEqual(await parseReminder(ctx, responseFor(candidate(incompleteModelCandidate))), ready({ ...partial, due_time: '18:00' }))
  }
})

test('invalid structured outcomes and invalid end ranges are rejected', async () => {
  assert.equal(validateParsedReminder({ ...base, due_time: '7pm' }), null)
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-08-24' }), null)
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-08-25', end_time: '13:00' }), null)
  assert.deepEqual(validateReminderParseResult(candidate({ ...base, due_date: null }, [], 'What day?')), clarify({ ...base, due_date: null }, ['due_date'], 'What day?'))
  assert.deepEqual(validateReminderParseResult(candidate({ ...base, due_date: null }, [], ''), 'no'), clarify({ ...base, due_date: null }, ['due_date'], 'Hvilken dag?'))
  assert.deepEqual(validateReminderParseResult(candidate({ ...base, due_date: null }, [], ' '.repeat(241)), 'en'), clarify({ ...base, due_date: null }, ['due_date'], 'Which day?'))
  assert.equal(validateReminderParseResult(candidate(base, ['due_date'], 'What day?')), null)
})

test('real calendar dates accept valid leap and ordinary days and reject impossible dates', () => {
  assert.equal(validateParsedReminder({ ...base, due_date: '2026-02-31' }), null)
  assert.deepEqual(validateParsedReminder({ ...base, due_date: '2028-02-29' }), { ...base, due_date: '2028-02-29' })
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-02-31' }), null)
})

test('schema and prompt preserve canonical semantic titles', () => {
  assert.equal('note' in reminderParseJsonSchema.properties, false)
  assert.equal('status' in reminderParseJsonSchema.properties, false)
  assert.equal('partial' in reminderParseJsonSchema.properties, false)
  assert.equal(reminderParseJsonSchema.properties.reminder.type, 'object')
  const prompt = readFileSync(new URL('../app/lib/reminders/parser.ts', import.meta.url), 'utf8')
  assert.match(prompt, /Remove date, start-time, end-time, and recurrence wording only when that exact information was successfully represented/)
  assert.match(prompt, /Any meaningful information unsupported by structured fields remains in title/)
})

test('reminder parsing uses its dedicated model and never inherits OPENAI_MODEL', async () => {
  const previousReminderModel = process.env.REMINDER_PARSE_MODEL
  const previousGenericModel = process.env.OPENAI_MODEL
  delete process.env.REMINDER_PARSE_MODEL
  process.env.OPENAI_MODEL = 'generic-model-must-not-be-used'
  let selectedModel
  try {
    await parseReminder(context('Dentist tomorrow'), async (_url, options) => {
      selectedModel = JSON.parse(options.body).model
      return responseFor(candidate(base))(_url, options)
    })
    assert.equal(selectedModel, 'gpt-5-mini')
    process.env.REMINDER_PARSE_MODEL = 'reminder-specific-model'
    await parseReminder(context('Dentist tomorrow'), async (_url, options) => {
      selectedModel = JSON.parse(options.body).model
      return responseFor(candidate(base))(_url, options)
    })
    assert.equal(selectedModel, 'reminder-specific-model')
  } finally {
    if (previousReminderModel == null) delete process.env.REMINDER_PARSE_MODEL; else process.env.REMINDER_PARSE_MODEL = previousReminderModel
    if (previousGenericModel == null) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previousGenericModel
  }
})

test('parser failures are fail-soft, reason-coded, and never log sensitive content', async () => {
  const logs = []
  const originalError = console.error
  console.error = (...args) => logs.push(args)
  try {
    assert.equal(await parseReminder(context('PRIVATE HTTP TEXT'), async () => new Response('', { status: 429 })), null)
    assert.equal(await parseReminder(context('PRIVATE TIMEOUT TEXT'), async () => { throw new DOMException('PRIVATE ANSWER', 'AbortError') }), null)
    assert.equal(await parseReminder(context('PRIVATE JSON TEXT'), responseForText('{broken')), null)
    assert.equal(await parseReminder(context('PRIVATE INVALID TEXT'), responseForText(JSON.stringify(candidate({ ...base, due_time: 'tomorrow' })))), null)
  } finally { console.error = originalError }
  assert.deepEqual(logs.map(([reason]) => reason), [
    'reminder_parse_openai_http_error', 'reminder_parse_timeout',
    'reminder_parse_invalid_json', 'reminder_parse_invalid_result',
  ])
  assert.deepEqual(logs[0][1], { status: 429 })
  const serializedLogs = JSON.stringify(logs)
  assert.doesNotMatch(serializedLogs, /PRIVATE|ANSWER|Authorization|test-key/)
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /onEditDetails\(draftFromText\(\)\)/)
  assert.match(home, /clarificationRounds >= 2/)
  assert.match(home, /I just need one more detail/)
})

test('successful latency diagnostics contain only duration and outcome', async () => {
  const logs = []
  const originalInfo = console.info
  console.info = (...args) => logs.push(args)
  try {
    const ctx = { ...context('PRIVATE REMINDER TEXT'), clarificationAnswer: 'PRIVATE CLARIFICATION ANSWER' }
    assert.deepEqual(await parseReminder(ctx, responseFor(candidate(base))), ready(base))
  } finally { console.info = originalInfo }
  assert.equal(logs.length, 1)
  assert.equal(logs[0][0], 'reminder_parse_completed')
  assert.equal(typeof logs[0][1].duration_ms, 'number')
  assert.equal(logs[0][1].outcome, 'ready')
  assert.deepEqual(Object.keys(logs[0][1]).sort(), ['duration_ms', 'outcome'])
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE|REMINDER|CLARIFICATION|ANSWER/)
})

test('composer shows localized initial and clarification thinking states and guards duplicate parsing', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /Forbereder påminnelsen …/)
  assert.match(home, /Understanding your reminder …/)
  assert.match(home, /Fullfører påminnelsen …/)
  assert.match(home, /Finishing your reminder …/)
  assert.match(home, /parsing \? <ReminderThinkingState language=\{language\} completing=\{false\}/)
  assert.match(home, /parsing \? <ReminderThinkingState language=\{language\} completing/)
  assert.match(home, /if \(parsingRef\.current\) return/)
  assert.match(home, /reminder-thinking-dot/)
  const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*\.reminder-thinking-dot \{ animation: none/)
})

const responseForText = (text) => async () => new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text }] }] }), { status: 200 })

test('a valid clarification candidate is successful and therefore does not become a 503', async () => {
  const partial = { ...base, title: 'Hent Siri', due_date: null, due_time: null }
  const result = await parseReminder(context('Hent Siri etter jobb', 'no'), responseFor(candidate(partial, ['due_date', 'due_time'], 'Når skal jeg minne deg på det?')))
  assert.deepEqual(result, clarify(partial))
  const route = readFileSync(new URL('../app/api/reminders/parse/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(!result\).*503/)
})

test('server supplies a Norwegian date question when the model omits clarification metadata', async () => {
  const partial = { ...base, title: 'Hent Siri', due_date: null, due_time: null }
  const result = await parseReminder(context('Hent Siri', 'no'), responseFor(candidate(partial)))
  assert.deepEqual(result, clarify(partial, ['due_date'], 'Hvilken dag?'))
})

test('server supplies a generic Norwegian question when date and implied time are missing', async () => {
  const partial = { ...base, title: 'Hent Siri', due_date: null, due_time: null }
  const result = await parseReminder(context('Hent Siri etter jobb', 'no'), responseFor(candidate(partial, ['due_date', 'due_time'])))
  assert.deepEqual(result, clarify(partial, ['due_date', 'due_time'], 'Når skal jeg minne deg på det?'))
})

test('a valid contextual model question is preserved unchanged', async () => {
  const partial = { ...base, title: 'Hent Siri', due_date: null, due_time: null }
  const question = 'Når er du ferdig på jobb?'
  const result = await parseReminder(context('Hent Siri etter jobb', 'no'), responseFor(candidate(partial, ['due_date', 'due_time'], question)))
  assert.deepEqual(result, clarify(partial, ['due_date', 'due_time'], question))
})

test('server clarification fallback follows the requested English language', async () => {
  const partial = { ...base, title: 'Call Dad', due_date: null, due_time: null }
  const result = await parseReminder(context('Call Dad', 'en'), responseFor(candidate(partial)))
  assert.deepEqual(result, clarify(partial, ['due_date'], 'Which day?'))
})

test('end values round-trip while device output remains unchanged', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const device = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  assert.equal((home.match(/end_date: endDate \|\| null/g) || []).length, 2)
  assert.doesNotMatch(device, /end_date|end_time/)
  assert.match(device, /nextReminderOccurrenceDate/)
})

test('parser version and occurrence end semantics are explicit', () => {
  assert.equal(REMINDER_PARSE_VERSION, 'reminder-parse-v3')
  const source = readFileSync(new URL('../app/lib/reminders/parser.ts', import.meta.url), 'utf8')
  assert.match(source, /end_date\/end_time describe this occurrence, never recurrence termination/)
  assert.doesNotMatch(source, /repeat_until/)
})

test.after(() => { if (originalKey == null) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey })
