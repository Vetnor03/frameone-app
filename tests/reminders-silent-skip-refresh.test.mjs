import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homePage = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('local event skip toggles revalidate reminders without showing global loading', () => {
  const remindersStart = homePage.indexOf('function RemindersModuleSettingsTab')
  const loadStart = homePage.indexOf('async function loadReminders', remindersStart)
  const toggleStart = homePage.indexOf('async function toggleLocalEventFrameSkip', loadStart)
  const toggleEnd = homePage.indexOf('function toggleSelectedDay', toggleStart)

  assert.ok(remindersStart >= 0)
  assert.ok(loadStart > remindersStart)
  assert.ok(toggleStart > loadStart)
  assert.ok(toggleEnd > toggleStart)

  const loader = homePage.slice(loadStart, toggleStart)
  assert.match(loader, /\{ silent = false \}: \{ silent\?: boolean \} = \{\}/)
  assert.match(loader, /if \(!silent\) setLoading\(true\)/)
  assert.match(loader, /if \(!silent\) setLoading\(false\)/)

  const toggle = homePage.slice(toggleStart, toggleEnd)
  assert.match(toggle, /setReminders\(\(current\) => current\.map/)
  assert.match(toggle, /await loadReminders\(\{ silent: true \}\)/)
  assert.doesNotMatch(toggle, /remind:refresh-reminders/)
})
