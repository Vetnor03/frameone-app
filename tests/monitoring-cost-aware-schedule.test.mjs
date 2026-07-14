import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculateNextCheck, normalizeMonitoringClass, MIN_PAID_MONITORING_INTERVAL_MINUTES } from '../supabase/functions/_shared/monitoring/schedule.ts'

const migration = readFileSync(new URL('../supabase/migrations/20260714120000_add_cost_aware_monitoring_schedule.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../supabase/functions/monitoring-worker/index.ts', import.meta.url), 'utf8')
const interpreter = readFileSync(new URL('../supabase/functions/interpret-ai-assistant/index.ts', import.meta.url), 'utf8')

test('normal watch backs off from 3h to 6h to 12h to 24h', () => {
  assert.equal(calculateNextCheck({ monitoring_class: 'normal', consecutive_no_change_count: 0, status: 'no_change' }).nextMinutes, 180)
  assert.equal(calculateNextCheck({ monitoring_class: 'normal', consecutive_no_change_count: 1, status: 'no_change' }).nextMinutes, 360)
  assert.equal(calculateNextCheck({ monitoring_class: 'normal', consecutive_no_change_count: 2, status: 'no_change' }).nextMinutes, 720)
  assert.equal(calculateNextCheck({ monitoring_class: 'normal', consecutive_no_change_count: 3, status: 'no_change' }).nextMinutes, 1440)
})

test('change resets streak and uses shorter class interval', () => {
  const result = calculateNextCheck({ monitoring_class: 'active', consecutive_no_change_count: 4, status: 'change', createdUpdate: true })
  assert.equal(result.consecutiveNoChangeCount, 0)
  assert.equal(result.nextMinutes, 120)
  assert.ok(result.lastChangeAt)
})

test('urgent expires and downgrades to active', () => {
  const result = calculateNextCheck({ monitoring_class: 'urgent', urgent_until: '2026-07-13T00:00:00.000Z', status: 'no_change', now: new Date('2026-07-14T00:00:00.000Z') })
  assert.equal(result.monitoringClass, 'active')
  assert.equal(result.nextMinutes, 120)
})

test('model suggesting 5 minutes is constrained by server minimum and class policy', () => {
  assert.equal(MIN_PAID_MONITORING_INTERVAL_MINUTES, 60)
  assert.equal(calculateNextCheck({ monitoring_class: 'normal', consecutive_no_change_count: 0, status: 'change', createdUpdate: true, suggested_next_check_minutes: 5 }).nextMinutes, 180)
})

test('uncertain results do not create updates and avoid expensive loops', () => {
  const first = calculateNextCheck({ monitoring_class: 'normal', consecutive_no_change_count: 0, status: 'uncertain' })
  const repeated = calculateNextCheck({ monitoring_class: 'normal', consecutive_no_change_count: 3, status: 'uncertain' })
  assert.equal(first.nextMinutes, 360)
  assert.equal(repeated.nextMinutes, 720)
  assert.match(worker, /status === 'change' && !createdUpdate\) effectiveStatus = 'uncertain'/)
})

test('repeated errors use exponential backoff', () => {
  assert.equal(calculateNextCheck({ monitoring_class: 'normal', status: 'error', attempts: 1 }).nextMinutes, 10)
  assert.equal(calculateNextCheck({ monitoring_class: 'normal', status: 'error', attempts: 4 }).nextMinutes, 80)
})

test('existing watches receive safe defaults and interpretation validates class server-side', () => {
  assert.match(migration, /monitoring_class text not null default 'normal'/)
  assert.match(migration, /consecutive_no_change_count integer not null default 0/)
  assert.match(migration, /monitoring_usage_limits/)
  assert.match(interpreter, /MONITORING_MAX_ACTIVE_WATCHES_PER_USER/)
  assert.equal(normalizeMonitoringClass('urgent', 'Major OpenAI/ChatGPT news'), 'normal')
})
