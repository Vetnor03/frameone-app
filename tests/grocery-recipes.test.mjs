import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { groceryRecipeItem, isUnmeasuredGroceryItem, parseManualIngredients, recipeMergeDecision, scaleRecipeQuantity, selectedRecipeGroceries } from '../app/lib/groceries/recipes.mjs'
import { assertPublicRecipeHost, fetchPublicRecipePage, safePublicRecipeUrl } from '../app/lib/groceries/urlSafety.mjs'

test('manual ingredient parsing handles fractions, vulgar fractions, and ranges conservatively', () => {
  assert.deepEqual(parseManualIngredients('1/2 tsp salt\n½ tsp pepper\n2-3 tomatoes\n2–3 onions'), [
    { name: 'salt', quantity: .5, unit: 'tsp', category: 'other' },
    { name: 'pepper', quantity: .5, unit: 'tsp', category: 'other' },
    { name: 'tomatoes', quantity: 3, unit: null, category: 'other' },
    { name: 'onions', quantity: 3, unit: null, category: 'other' },
  ])
  assert.deepEqual(parseManualIngredients('salt to taste')[0], { name: 'salt to taste', quantity: null, unit: null, category: 'other' })
})

test('serving scaling and quantity conversion keep names separate from units', () => {
  assert.equal(scaleRecipeQuantity(.5, 2, 6), 1.5)
  assert.deepEqual(groceryRecipeItem({ name: 'Milk', quantity: 1, unit: 'L', category: 'dairy' }, 2), { name: 'Milk', quantity: 1, amount: 2, unit: 'l' })
  assert.deepEqual(groceryRecipeItem({ name: 'Tomatoes', quantity: 2, unit: null, category: 'other' }, 2), { name: 'Tomatoes', quantity: 2, amount: null, unit: null })
})

test('duplicate decisions merge only compatible amounts and counts', () => {
  assert.deepEqual(recipeMergeDecision([{ name: 'Milk', quantity: 1, amount: null, unit: null }], { name: 'milk', quantity: 1, amount: 1, unit: 'l' }), { type: 'merge', index: 0, quantity: 1, amount: 1, unit: 'l' })
  assert.deepEqual(recipeMergeDecision([{ name: 'Milk', quantity: 1, amount: 1, unit: 'L' }], { name: 'Milk', quantity: 1, amount: 2, unit: 'l' }), { type: 'merge', index: 0, quantity: 1, amount: 3, unit: 'l' })
  assert.deepEqual(recipeMergeDecision([{ name: 'Tomatoes', quantity: 3, amount: null, unit: null }], { name: 'tomatoes', quantity: 2, amount: null, unit: null }), { type: 'merge', index: 0, quantity: 5, amount: null, unit: null })
  assert.deepEqual(recipeMergeDecision([{ name: 'Flour', quantity: 2, amount: null, unit: null }], { name: 'Flour', quantity: 1, amount: 1, unit: 'kg' }), { type: 'separate' })
})

test('normal grocery add does not merge into a measured recipe row', () => {
  const recipeMilk = { name: 'Milk', quantity: 1, amount: 1, unit: 'l' }
  const normalMilk = { name: 'Milk', quantity: 1, amount: null, unit: null }
  assert.equal(isUnmeasuredGroceryItem(recipeMilk), false)
  assert.equal(isUnmeasuredGroceryItem(normalMilk), true)
  const rowsEligibleForTheExistingNormalMerge = [recipeMilk, normalMilk].filter(isUnmeasuredGroceryItem)
  assert.deepEqual(rowsEligibleForTheExistingNormalMerge, [normalMilk])
})

test('only selected recipe ingredients become grocery inputs', () => {
  const result = selectedRecipeGroceries([
    { name: 'Milk', quantity: 1, unit: 'l', category: 'dairy', selected: true },
    { name: 'Salt', quantity: 1, unit: 'tsp', category: 'spices', selected: false },
  ], 2, 4)
  assert.deepEqual(result, [{ name: 'Milk', quantity: 1, amount: 2, unit: 'l', category: 'dairy' }])
})

test('URL validation rejects local targets and validates every redirect', async () => {
  for (const url of ['http://localhost/recipe', 'http://127.0.0.1/x', 'http://10.0.0.2/x', 'http://[::1]/x', 'file:///etc/passwd']) assert.equal(safePublicRecipeUrl(url), null)
  assert.equal(safePublicRecipeUrl('https://recipes.example/pasta')?.hostname, 'recipes.example')
  let calls = 0
  const redirectingFetch = async () => {
    calls += 1
    return new Response('', { status: 302, headers: { location: calls === 1 ? 'https://cdn.example/recipe' : 'http://192.168.1.4/secret' } })
  }
  const publicLookup = async () => [{ address: '203.0.113.10', family: 4 }]
  await assert.rejects(fetchPublicRecipePage('https://recipes.example/start', redirectingFetch, {}, publicLookup), /unsafe_redirect/)
  assert.equal(calls, 2)
  await assert.rejects(assertPublicRecipeHost(new URL('https://innocent.example/recipe'), async () => [{ address: '127.0.0.1', family: 4 }]), /unsafe_address/)
  await assert.rejects(fetchPublicRecipePage('https://public.example/recipe', async () => new Response('should not fetch'), {}, async () => [{ address: '10.0.0.7', family: 4 }]), /unsafe_address/)
})

test('the existing quick ADD ITEM action remains primary and opens its original sheet directly', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const quickAdd = ui.indexOf("setEditingItem(null)\n            setSheetOpen(true)")
  const addItemLabel = ui.indexOf("'ADD ITEM'", quickAdd)
  const recipeAction = ui.indexOf("setRecipeOpen(true)", addItemLabel)
  assert.ok(quickAdd > -1 && addItemLabel > quickAdd && recipeAction > addItemLabel)
})
