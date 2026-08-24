import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { groceryItemEditPayload, groceryRecipeItem, isUnmeasuredGroceryItem, parseManualIngredients, recipeMergeDecision, saveRecipeWithRollback, scaleRecipeQuantity, selectedRecipeGroceries } from '../app/lib/groceries/recipes.mjs'
import { assertPublicRecipeHost, fetchPublicRecipePage, safePublicRecipeUrl } from '../app/lib/groceries/urlSafety.mjs'

const recipeRepairMigration = readFileSync(new URL('../supabase/migrations/20260824140000_reconcile_saved_recipe_legacy_schema.sql', import.meta.url), 'utf8')

test('saved recipe repair migration restores the complete schema and access controls', () => {
  for (const column of ['id uuid default gen_random_uuid()', 'device_id text', 'name text', "locale text default 'en'", 'is_active boolean default true', 'source_url text', 'base_servings numeric', 'created_at timestamptz default now()', 'updated_at timestamptz default now()', 'recipe_id uuid', "category text default 'other'", 'is_optional boolean default false', 'quantity numeric', 'unit text', 'sort_order integer default 0', 'amount numeric']) {
    assert.ok(recipeRepairMigration.includes(`add column if not exists ${column}`), `missing repair column: ${column}`)
  }
  for (const column of ['locale', 'is_active', 'created_at', 'updated_at', 'recipe_id', 'category', 'is_optional', 'sort_order']) {
    assert.match(recipeRepairMigration, new RegExp(`alter column ${column} set not null`))
  }
  assert.match(recipeRepairMigration, /foreign key \(recipe_id\) references public\.grocery_recipes\(id\)[\s\S]*on delete cascade not valid/)
  assert.match(recipeRepairMigration, /grocery_recipes_device_id_idx[\s\S]*on public\.grocery_recipes \(device_id\)/)
  assert.match(recipeRepairMigration, /grocery_recipe_ingredients_recipe_id_idx[\s\S]*on public\.grocery_recipe_ingredients \(recipe_id\)/)
  assert.match(recipeRepairMigration, /create trigger trg_set_grocery_recipes_updated_at[\s\S]*execute function public\.set_timestamp_updated_at\(\)/)
  assert.match(recipeRepairMigration, /for insert[\s\S]*device_id is not null[\s\S]*dm\.device_id = grocery_recipes\.device_id[\s\S]*dm\.user_id = auth\.uid\(\)/)
  assert.match(recipeRepairMigration, /on public\.grocery_recipe_ingredients for all[\s\S]*join public\.device_members dm on dm\.device_id = gr\.device_id[\s\S]*dm\.user_id = auth\.uid\(\)/)
  assert.match(recipeRepairMigration, /grant select, insert, update, delete on public\.grocery_recipes to authenticated/)
  assert.match(recipeRepairMigration, /grant select, insert, update, delete on public\.grocery_recipe_ingredients to authenticated/)
  assert.match(recipeRepairMigration, /rename column ingredient_name to name/)
  assert.match(recipeRepairMigration, /set name = ingredient_name where name is null and ingredient_name is not null/)
  assert.match(recipeRepairMigration, /alter column ingredient_name drop not null/)
  assert.match(recipeRepairMigration, /is_nullable = 'NO'/)
  assert.match(recipeRepairMigration, /drop column ingredient_name/)
  assert.match(recipeRepairMigration, /notify pgrst, 'reload schema'/)
})

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

test('editing a measured grocery updates amount and unit without misusing package quantity', () => {
  assert.deepEqual(groceryItemEditPayload(' Milk ', 2, 'dairy', { amount: 2, unit: ' L ' }), { name: 'Milk', quantity: 1, amount: 2, unit: 'L', category: 'dairy' })
  assert.deepEqual(groceryItemEditPayload('Milk', 2, 'dairy'), { name: 'Milk', quantity: 2, amount: null, unit: null, category: 'dairy' })
})

test('failed ingredient persistence rolls back its newly created recipe', async () => {
  const events = []
  await assert.rejects(saveRecipeWithRollback({
    createRecipe: async () => { events.push('recipe-created'); return { id: 'recipe-1' } },
    createIngredients: async (_id, ingredients) => { events.push(`ingredients:${ingredients.length}`); throw new Error('duplicate ingredient') },
    deleteRecipe: async (id) => { events.push(`recipe-deleted:${id}`) },
  }, { name: 'Soup' }, [{ name: 'Salt' }, { name: ' salt ' }]), /duplicate ingredient/)
  assert.deepEqual(events, ['recipe-created', 'ingredients:1', 'recipe-deleted:recipe-1'])
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

test('Dinner Plan and Recipes are equal side-by-side secondary actions below primary ADD ITEM', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const primary = ui.indexOf("language === 'no' ? 'LEGG TIL VARE' : 'ADD ITEM'")
  const secondaryGrid = ui.indexOf('grid w-[260px] grid-cols-2 gap-2', primary)
  const dinner = ui.indexOf("language === 'no' ? 'MIDDAGSPLAN' : 'DINNER PLAN'", secondaryGrid)
  const recipes = ui.indexOf("language === 'no' ? 'OPPSKRIFTER' : 'RECIPES'", dinner)
  const sharedStyle = 'h-[44px] rounded-2xl border border-[color:var(--bd-15)] text-[10px] tracking-widest text-[color:var(--fg-75)] transition disabled:opacity-40'
  assert.ok(primary > -1 && secondaryGrid > primary && dinner > secondaryGrid && recipes > dinner)
  assert.equal(ui.slice(secondaryGrid, recipes + 500).split(sharedStyle).length - 1, 2)
})

test('recipe library loads alphabetically and supports live name search', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  assert.match(ui, /\.order\('name', \{ ascending: true \}\)/)
  assert.match(ui, /localeCompare\(String\(b\.name\)/)
  assert.match(ui, /const visibleRecipes = savedRecipes\.filter\(\(recipe\) => String\(recipe\.name\).*includes\(recipeSearch\.trim\(\)/)
  assert.match(ui, /type="search" value=\{recipeSearch\} onChange=\{\(e\) => setRecipeSearch\(e\.target\.value\)\}/)
})

test('saved recipe previews restore every ingredient selected without ingredient removal controls', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const recipeSheet = ui.slice(ui.indexOf('function RecipeSheet('), ui.indexOf('function GroceriesDraftSheet('))
  assert.match(recipeSheet, /next\.ingredients\.map\(\(item\) => \(\{ \.\.\.item, selected: true \}\)\)/)
  assert.doesNotMatch(recipeSheet, /aria-label="Remove"|all\.filter\(\(_.*,i\) => i !== index\)/)
})

test('unchecked recipe ingredients remain visible, are labelled, and only selected items are added', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const recipeSheet = ui.slice(ui.indexOf('function RecipeSheet('), ui.indexOf('function GroceriesDraftSheet('))
  assert.match(recipeSheet, /ingredients\.map\(\(item, index\) =>/)
  assert.match(recipeSheet, /item\.selected \? '' : 'bg-/)
  assert.match(recipeSheet, /'Har hjemme' : 'Already have'/)
  assert.match(recipeSheet, /selectedRecipeGroceries\(ingredients, draft\?\.servings \?\? null, servings\)/)
  assert.match(recipeSheet, /`LEGG \$\{selected\.length\} I HANDLELISTEN` : `ADD \$\{selected\.length\} TO GROCERIES`/)
})

test('saved recipe retains its ID when opened in preview', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const recipeSheet = ui.slice(ui.indexOf('function RecipeSheet('), ui.indexOf('function GroceriesDraftSheet('))
  assert.match(recipeSheet, /const \[savedRecipeId, setSavedRecipeId\] = useState<string \| null>\(null\)/)
  assert.match(recipeSheet, /showPreview\(\{ name: recipe\.name,[\s\S]*?\}, String\(recipe\.id\)\)/)
  assert.match(recipeSheet, /setSavedRecipeId\(recipeId\)/)
})

test('saved recipe preview is read-only and offers confirmed cascading deletion', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const recipeSheet = ui.slice(ui.indexOf('function RecipeSheet('), ui.indexOf('function GroceriesDraftSheet('))
  assert.match(recipeSheet, /savedRecipeId \? <div className="text-lg font-medium">\{draft\.name\}<\/div> : <input/)
  assert.match(recipeSheet, /savedRecipeId \? <div>\{item\.name\}<\/div> : <input/)
  assert.match(recipeSheet, /!savedRecipeId \? <button[^>]*onClick=\{saveRecipe\}/)
  assert.match(recipeSheet, /savedRecipeId \? <button[^>]*onClick=\{deleteRecipe\}/)
  assert.match(recipeSheet, /window\.confirm\(language === 'no' \? 'Slette denne oppskriften\?' : 'Delete this recipe\?'/)
  assert.match(recipeSheet, /from\('grocery_recipes'\)\.delete\(\)\.eq\('id', savedRecipeId\)\.eq\('device_id', deviceId\)/)
  assert.match(recipeSheet, /await loadSaved\(\{ preservePending: true \}\)/)
  assert.match(recipeSheet, /'SLETTER OPPSKRIFT…' : 'DELETING RECIPE…'/)
  assert.match(recipeSheet, /'OPPSKRIFT SLETTET' : 'RECIPE DELETED'/)
  assert.match(recipeRepairMigration, /foreign key \(recipe_id\) references public\.grocery_recipes\(id\)[\s\S]*on delete cascade not valid/)
})

test('unchecked state is never persisted when explicitly saving recipe ingredients', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const recipeSheet = ui.slice(ui.indexOf('async function saveRecipe()'), ui.indexOf('async function addSelectedIngredients()'))
  assert.match(recipeSheet, /const rows = ingredients\.map\(/)
  assert.doesNotMatch(recipeSheet, /ingredients\.filter\([^)]*selected/)
  assert.doesNotMatch(recipeSheet, /selected:/)
})

test('new imported and manual recipes still use insert with rollback protection', async () => {
  const ui = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
  const recipeSheet = ui.slice(ui.indexOf('function RecipeSheet('), ui.indexOf('function GroceriesDraftSheet('))
  assert.match(recipeSheet, /showPreview\(payload\)/)
  assert.match(recipeSheet, /showPreview\(\{ name: manualName\.trim\(\)/)
  assert.match(recipeSheet, /if \(!draft \|\| savedRecipeId\) return[\s\S]*saveRecipeWithRollback\([\s\S]*\.from\('grocery_recipes'\)\.insert/)
  assert.match(recipeSheet, /setSavedRecipeId\(created\.id\)/)
})
