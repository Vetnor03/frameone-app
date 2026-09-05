import assert from 'node:assert/strict'
import test from 'node:test'
import { easterSunday, norwegianStarterReminderDate } from '../app/lib/onboardingDefaults.ts'

test('Norwegian parent days recalculate their weekday pattern across years', () => {
  assert.equal(norwegianStarterReminderDate('mothers-day', 2026), '2026-02-08')
  assert.equal(norwegianStarterReminderDate('mothers-day', 2027), '2027-02-14')
  assert.equal(norwegianStarterReminderDate('fathers-day', 2026), '2026-11-08')
  assert.equal(norwegianStarterReminderDate('fathers-day', 2027), '2027-11-14')
})

test('Easter-relative Norway dates recalculate across years', () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05')
  assert.equal(norwegianStarterReminderDate('maundy-thursday', 2026), '2026-04-02')
  assert.equal(norwegianStarterReminderDate('good-friday', 2027), '2027-03-26')
  assert.equal(norwegianStarterReminderDate('easter-monday', 2028), '2028-04-17')
  assert.equal(norwegianStarterReminderDate('ascension-day', 2026), '2026-05-14')
  assert.equal(norwegianStarterReminderDate('whit-monday', 2027), '2027-05-17')
})
