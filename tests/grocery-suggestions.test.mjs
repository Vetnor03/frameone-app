import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  findGrocerySuggestionByExactKey,
  mergeGrocerySuggestionsByExactKey,
  normalizeGrocerySuggestionKey,
  rankGrocerySuggestionsForInput,
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

test('remembered grocery items appear as prefix-first autocomplete options', () => {
  const items = [
    { name: 'Sjokolademelk', category: 'drinks', usageCount: 24, lastUsedAt: '2026-10-10T00:00:00.000Z' },
    { name: '  Melk ', category: 'dairy', usageCount: 1, lastUsedAt: '2026-10-13T00:00:00.000Z' },
    { name: 'Lettmelk', category: 'dairy', usageCount: 8, lastUsedAt: '2026-10-12T00:00:00.000Z' },
    { name: 'Brød', category: 'bread', usageCount: 2, lastUsedAt: null },
  ]

  const matched = rankGrocerySuggestionsForInput(items, '  MeL ', 'dairy')
  assert.deepEqual(matched.map((item) => item.name), ['  Melk ', 'Lettmelk', 'Sjokolademelk'])
  assert.equal(items[0].name, 'Sjokolademelk', 'sorting must not mutate loaded history')
})

test('grocery suggestions favor saved category, frequency and recency after prefix match', () => {
  const items = [
    { name: 'Milk', category: 'dairy', usageCount: 1, lastUsedAt: '2026-10-10T00:00:00.000Z' },
    { name: 'Mild salsa', category: 'other', usageCount: 20, lastUsedAt: '2026-10-13T00:00:00.000Z' },
    { name: 'Millet', category: 'dairy', usageCount: 1, lastUsedAt: '2026-10-12T00:00:00.000Z' },
  ]
  assert.deepEqual(rankGrocerySuggestionsForInput(items, 'mil', 'dairy').map((x) => x.name), [
    'Millet', 'Milk', 'Mild salsa',
  ])
})

test('grocery screen fetches all saved items instead of limiting suggestions to the top 50', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const historyLoader = source.slice(source.indexOf('  async function loadHistory() {'), source.indexOf('  useEffect(() => {\n    loadGroceries()'))
  assert.match(historyLoader, /\.range\(offset, offset \+ pageSize - 1\)/)
  assert.doesNotMatch(historyLoader, /\.limit\(50\)/)
  assert.match(source, /if \(sheetOpen\) void loadHistory\(\)/)
  assert.match(source, /rankGrocerySuggestionsForInput\(suggestions, name, category\)/)
})
