import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const interpreter = readFileSync(new URL('../supabase/functions/interpret-ai-assistant/index.ts', import.meta.url), 'utf8')

test('Watch interpretation prompt prohibits schedule and cost internals in generated descriptions', () => {
  assert.match(interpreter, /Never expose monitoring frequency or cadence in any human-facing field/)
  assert.match(interpreter, /Never mention intervals, how often checks run, cost-efficient or optimized checking, tokens, API costs, scheduling internals, frame wakes, OpenAI calls, or paid-run limits/)
  assert.match(interpreter, /Describe only what RE:MIND follows, what meaningful change triggers an update, and what the user will be notified about/)
  assert.match(interpreter, /Do not claim monitoring is real-time, immediate, or continuous/)
})

test('generated human-facing fields are rejected if they expose monitoring internals', () => {
  assert.match(interpreter, /humanFacingText = \[v\.title, v\.normalized_goal, v\.trigger_description, v\.completion_condition/)
  for (const phrase of ['check interval', 'monitoring frequency', 'cost-efficient', 'token usage', 'API cost', 'frame wakes', 'OpenAI calls']) assert.match(interpreter, new RegExp(phrase, 'i'))
  assert.ok(interpreter.includes('every\\s+\\d+\\s+minutes'))
  assert.match(interpreter, /user_facing_monitoring_internals/)
})
