import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseReminder, reminderParseJsonSchema, validateParsedReminder, validateReminderParseResult, REMINDER_PARSE_VERSION } from '../app/lib/reminders/parser.ts'

const originalKey = process.env.OPENAI_API_KEY
process.env.OPENAI_API_KEY = 'test-key'

const base = { title: 'Dentist', due_date: '2026-08-25', due_time: '14:30', end_date: null, end_time: null, repeat_type: 'none', custom_repeat_days: null, tag: null, ambiguities: [] }
const ready = (reminder) => ({ status: 'ready', reminder, partial: null, missing_fields: [], question: null })
const clarify = (partial, missing_fields = ['due_date', 'due_time'], question = 'Når skal jeg minne deg på det?') => ({ status: 'needs_clarification', reminder: null, partial, missing_fields, question })
const responseFor = (result, inspect) => async (_url, options) => {
  const request = JSON.parse(options.body)
  assert.equal(request.store, false)
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
]) test(name, async () => assert.deepEqual(await parseReminder(context(text, language), responseFor(ready(reminder))), ready(reminder)))

for (const [name, text, partial, missing] of [
  ['after work asks when without invention', 'Hent Siri etter jobb', { ...base, title: 'Hent Siri', due_date: null, due_time: null }, ['due_date', 'due_time']],
  ['later asks when without invention', 'Ring pappa senere', { ...base, title: 'Ring pappa', due_date: null, due_time: null }, ['due_date', 'due_time']],
  ['known time asks only for date', 'Tannlege kl. 14:30', { ...base, title: 'Tannlege', due_date: null, due_time: '14:30' }, ['due_date']],
]) test(name, async () => {
  const expected = clarify(partial, missing)
  assert.deepEqual(await parseReminder(context(text, 'no'), responseFor(expected)), expected)
})

test('clarification sends original, partial, question, and answer and can become ready', async () => {
  const partial = { ...base, title: 'Hent Siri', due_date: null, due_time: null }
  const reminder = { ...partial, due_date: '2026-08-19', due_time: '16:00' }
  const ctx = { ...context('Hent Siri etter jobb', 'no'), partial, clarificationQuestion: 'Når skal jeg minne deg på det?', clarificationAnswer: 'I dag kl. 16' }
  const result = await parseReminder(ctx, responseFor(ready(reminder), (payload) => {
    assert.equal(payload.original_reminder_text, ctx.text)
    assert.deepEqual(payload.existing_partial, partial)
    assert.equal(payload.clarification_question, ctx.clarificationQuestion)
    assert.equal(payload.clarification_answer, ctx.clarificationAnswer)
  }))
  assert.deepEqual(result, ready(reminder))
})

test('invalid structured outcomes and invalid end ranges are rejected', async () => {
  assert.equal(validateParsedReminder({ ...base, due_time: '7pm' }), null)
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-08-24' }), null)
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-08-25', end_time: '13:00' }), null)
  assert.equal(validateReminderParseResult(ready({ ...base, due_date: null })), null)
  assert.equal(validateReminderParseResult(clarify({ ...base, due_date: '2026-08-25' }, ['due_date'])), null)
  assert.equal(await parseReminder(context('Dentist'), responseFor(ready({ ...base, repeat_type: 'sometimes' }))), null)
})

test('real calendar dates accept valid leap and ordinary days and reject impossible dates', () => {
  assert.equal(validateParsedReminder({ ...base, due_date: '2026-02-31' }), null)
  assert.deepEqual(validateParsedReminder({ ...base, due_date: '2028-02-29' }), { ...base, due_date: '2028-02-29' })
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-02-31' }), null)
})

test('schema and prompt preserve canonical semantic titles', () => {
  assert.equal('note' in reminderParseJsonSchema.properties, false)
  assert.deepEqual(reminderParseJsonSchema.properties.status.enum, ['ready', 'needs_clarification'])
  const prompt = readFileSync(new URL('../app/lib/reminders/parser.ts', import.meta.url), 'utf8')
  assert.match(prompt, /Remove date, start-time, end-time, and recurrence wording only when that exact information was successfully represented/)
  assert.match(prompt, /Any meaningful information unsupported by structured fields remains in title/)
})

test('OpenAI failure is fail-soft and manual editing remains available', async () => {
  assert.equal(await parseReminder(context('Call Dad'), async () => { throw new Error('timeout') }), null)
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /onEditDetails\(draftFromText\(\)\)/)
  assert.match(home, /clarificationRounds >= 2/)
  assert.match(home, /I just need one more detail/)
})

test('end values round-trip while device output remains unchanged', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const device = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  assert.equal((home.match(/end_date: endDate \|\| null/g) || []).length, 2)
  assert.doesNotMatch(device, /end_date|end_time/)
  assert.match(device, /nextReminderOccurrenceDate/)
})

test('parser version and occurrence end semantics are explicit', () => {
  assert.equal(REMINDER_PARSE_VERSION, 'reminder-parse-v2')
  const source = readFileSync(new URL('../app/lib/reminders/parser.ts', import.meta.url), 'utf8')
  assert.match(source, /end_date\/end_time describe this occurrence, never recurrence termination/)
  assert.doesNotMatch(source, /repeat_until/)
})

test.after(() => { if (originalKey == null) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey })
