import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseReminder, validateParsedReminder, REMINDER_PARSE_VERSION } from '../app/lib/reminders/parser.ts'

const originalKey = process.env.OPENAI_API_KEY
process.env.OPENAI_API_KEY = 'test-key'

const base = {
  title: 'Dentist', due_date: '2026-08-25', due_time: '14:30', end_date: null, end_time: null,
  all_day: false, repeat_type: 'none', custom_repeat_days: null, tag: null, note: null, ambiguities: [],
}
const responseFor = (reminder) => async (_url, options) => {
  const request = JSON.parse(options.body)
  assert.equal(request.store, false)
  assert.equal(request.input[1].content[0].text.includes('2026-08-19T10:00:00'), true)
  return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(reminder) }] }] }), { status: 200 })
}
const context = (text, language = 'en') => ({ text, language, localNow: '2026-08-19T10:00:00+02:00', timezone: 'Europe/Oslo' })

for (const [name, text, language, expected] of [
  ['explicit date/time', 'Dentist 25 August at 14:30', 'en', base],
  ['relative date', 'Dentist tomorrow at 14:30', 'en', { ...base, due_date: '2026-08-20' }],
  ['Norwegian relative date', 'Tannlege i morgen kl. 14:30', 'no', { ...base, title: 'Tannlege', due_date: '2026-08-20' }],
  ['weekly recurrence', 'Put out the bins every Sunday', 'en', { ...base, title: 'Put out the bins', due_date: '2026-08-23', due_time: null, all_day: true, repeat_type: 'weekly' }],
  ['same-day time range', 'Conference 5 September from 10:00 to 15:00', 'en', { ...base, title: 'Conference', due_date: '2026-09-05', due_time: '10:00', end_date: '2026-09-05', end_time: '15:00' }],
  ['multi-day range', 'Trip to Bergen 5–7 September', 'en', { ...base, title: 'Trip to Bergen', due_date: '2026-09-05', due_time: null, end_date: '2026-09-07', all_day: true }],
  ['missing time remains null', 'Call Dad tomorrow', 'en', { ...base, title: 'Call Dad', due_date: '2026-08-20', due_time: null, all_day: true }],
  ['ambiguous later invents nothing', 'Call Dad later', 'en', { ...base, title: 'Call Dad', due_date: null, due_time: null, all_day: true, ambiguities: ['When?'] }],
]) test(name, async () => assert.deepEqual(await parseReminder(context(text, language), responseFor(expected)), expected))

test('invalid structured output and invalid end ranges are rejected', async () => {
  assert.equal(validateParsedReminder({ ...base, due_time: '7pm' }), null)
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-08-24' }), null)
  assert.equal(validateParsedReminder({ ...base, end_date: '2026-08-25', end_time: '13:00' }), null)
  assert.equal(await parseReminder(context('Dentist'), responseFor({ ...base, repeat_type: 'sometimes' })), null)
})

test('OpenAI failure is fail-soft and the composer preserves manual creation', async () => {
  assert.equal(await parseReminder(context('Call Dad'), async () => { throw new Error('timeout') }), null)
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /onEditDetails\(draftFromText\(\)\)/)
  assert.match(home, /setText\(e\.target\.value\)/)
})

test('end values round-trip in manual select, insert, and update while device output remains unchanged', () => {
  const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const device = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
  assert.match(home, /due_time, end_date, end_time, tag/)
  assert.equal((home.match(/end_date: endDate \|\| null/g) || []).length, 2)
  assert.doesNotMatch(device, /end_date|end_time/)
  assert.match(device, /nextReminderOccurrenceDate/)
})

test('parser version and semantics keep occurrence ends distinct from recurrence', () => {
  assert.equal(REMINDER_PARSE_VERSION, 'reminder-parse-v1')
  const source = readFileSync(new URL('../app/lib/reminders/parser.ts', import.meta.url), 'utf8')
  assert.match(source, /end_date\/end_time describe this occurrence; they are never recurrence termination/)
  assert.doesNotMatch(source, /repeat_until/)
})

test.after(() => { if (originalKey == null) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey })
