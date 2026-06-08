import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  findGrocerySuggestionByExactKey,
  mergeGrocerySuggestionsByExactKey,
  normalizeGrocerySuggestionKey,
} from '../app/lib/groceries/suggestions.ts'

test('grocery suggestion identity only trims, lowercases, and collapses spaces', () => {
  assert.equal(normalizeGrocerySuggestionKey('  Ost   Skiver '), 'ost skiver')
  assert.notEqual(normalizeGrocerySuggestionKey('ost'), normalizeGrocerySuggestionKey('revet ost'))
  assert.notEqual(normalizeGrocerySuggestionKey('melk'), normalizeGrocerySuggestionKey('sjokolademelk'))
  assert.notEqual(normalizeGrocerySuggestionKey('eple'), normalizeGrocerySuggestionKey('grønne epler'))
})

test('suggestion lookup does not match partial or containing names', () => {
  const suggestions = [
    { name: 'ost', usageCount: 4, lastUsedAt: '2026-06-01T00:00:00.000Z' },
    { name: 'revet ost', usageCount: 2, lastUsedAt: '2026-06-02T00:00:00.000Z' },
    { name: 'sjokolademelk', usageCount: 1, lastUsedAt: null },
  ]

  assert.equal(findGrocerySuggestionByExactKey(suggestions, ' ost ')?.name, 'ost')
  assert.equal(findGrocerySuggestionByExactKey(suggestions, 'OST')?.name, 'ost')
  assert.equal(findGrocerySuggestionByExactKey(suggestions, 'ost  ')?.name, 'ost')
  assert.equal(findGrocerySuggestionByExactKey(suggestions, 'melk'), null)
  assert.equal(findGrocerySuggestionByExactKey(suggestions, 'revet'), null)
})

test('suggestion merge preserves distinct grocery names', () => {
  const merged = mergeGrocerySuggestionsByExactKey([
    { name: 'ost', usageCount: 1, lastUsedAt: '2026-06-01T00:00:00.000Z' },
    { name: '  OST ', usageCount: 2, lastUsedAt: '2026-06-02T00:00:00.000Z' },
    { name: 'revet ost', usageCount: 3, lastUsedAt: '2026-06-03T00:00:00.000Z' },
  ])

  assert.deepEqual(merged.map((item) => item.name).sort(), ['OST', 'revet ost'])
  assert.equal(merged.find((item) => normalizeGrocerySuggestionKey(item.name) === 'ost')?.usageCount, 3)
})
