import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { localEventDisplayTitle } from '../app/lib/integrations/local-events/display.ts'

test('keeps the meaningful movie title while removing provider and anniversary cruft', () => {
  assert.equal(
    localEventDisplayTitle('Sølvberget cinematek: The Good, The Bad & The Ugly- 60 år!', '2026-09-15'),
    'The Good, The Bad & The Ugly'
  )
})

test('removes a redundant weekday and date suffix only when it matches the occurrence', () => {
  assert.equal(
    localEventDisplayTitle('The Print Workshop on Tuesdays, 15 September', '2026-09-15'),
    'The Print Workshop'
  )
})

test('preserves a meaningful date in the title when it does not match the occurrence date', () => {
  assert.equal(
    localEventDisplayTitle('My story – personal accounts from and about 22 July.', '2026-09-15'),
    'My story – personal accounts from and about 22 July.'
  )
})

test('preserves a nonmatching trailing event date instead of guessing it is metadata', () => {
  assert.equal(
    localEventDisplayTitle('Special workshop on Tuesday, 22 September', '2026-09-15'),
    'Special workshop on Tuesday, 22 September'
  )
})

test('supports Norwegian matching date suffixes', () => {
  assert.equal(
    localEventDisplayTitle('Verksted tirsdag, 15. september', '2026-09-15'),
    'Verksted'
  )
})

test('Local Events import stores the cleaned display title while retaining the raw source title', () => {
  const source = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
  assert.match(source, /const displayTitle = localEventDisplayTitle\(event\.title, event\.date\)/)
  assert.match(source, /title: displayTitle/)
  assert.match(source, /title: event\.title,\s*\n\s*displayTitle,/)
})
