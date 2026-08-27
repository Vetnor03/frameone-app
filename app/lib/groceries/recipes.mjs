const UNIT_ALIASES = new Map([
  ['l', 'l'], ['liter', 'l'], ['litre', 'l'], ['dl', 'dl'], ['ml', 'ml'],
  ['kg', 'kg'], ['g', 'g'], ['gram', 'g'], ['tsp', 'tsp'], ['ts', 'tsp'], ['teaspoon', 'tsp'],
  ['tbsp', 'tbsp'], ['tablespoon', 'tbsp'], ['ss', 'tbsp'], ['cup', 'cup'], ['cups', 'cup'],
  ['pc', 'count'], ['pcs', 'count'], ['piece', 'count'], ['pieces', 'count'], ['stk', 'count'], ['x', 'count'],
])
const VULGAR_FRACTIONS = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 }

function parseQuantityPrefix(line) {
  const mixed = line.match(/^(\d+)\s+([1-9]\d*)\/([1-9]\d*)\s+(.+)$/)
  if (mixed) return { quantity: Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]), rest: mixed[4] }
  const fraction = line.match(/^([1-9]\d*)\/([1-9]\d*)\s+(.+)$/)
  if (fraction) return { quantity: Number(fraction[1]) / Number(fraction[2]), rest: fraction[3] }
  const vulgar = line.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])\s+(.+)$/u)
  if (vulgar) return { quantity: Number(vulgar[1] || 0) + VULGAR_FRACTIONS[vulgar[2]], rest: vulgar[3] }
  const range = line.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s+(.+)$/)
  if (range) return { quantity: Math.max(Number(range[1].replace(',', '.')), Number(range[2].replace(',', '.'))), rest: range[3] }
  const decimal = line.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/)
  return decimal ? { quantity: Number(decimal[1].replace(',', '.')), rest: decimal[2] } : null
}

export function normalizeRecipeUnit(unit) {
  if (!unit) return null
  return UNIT_ALIASES.get(String(unit).trim().toLocaleLowerCase().replace(/\.$/, '')) || String(unit).trim().toLocaleLowerCase()
}

export function parseManualIngredients(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parsed = parseQuantityPrefix(line)
    if (!parsed || !Number.isFinite(parsed.quantity) || parsed.quantity <= 0) return { name: line, quantity: null, unit: null, category: 'other' }
    const unitMatch = parsed.rest.match(/^(\S+)\s+(.+)$/)
    const normalizedUnit = unitMatch && UNIT_ALIASES.has(unitMatch[1].toLocaleLowerCase().replace(/\.$/, '')) ? unitMatch[1] : null
    return { name: (normalizedUnit ? unitMatch[2] : parsed.rest).trim(), quantity: parsed.quantity, unit: normalizedUnit, category: 'other' }
  })
}

export function scaleRecipeQuantity(quantity, baseServings, servings) {
  if (quantity == null || !baseServings || !servings) return quantity
  return Math.round(quantity * servings / baseServings * 100) / 100
}

export function groceryRecipeItem(ingredient, scaledQuantity) {
  const unit = normalizeRecipeUnit(ingredient.unit)
  if (!unit || unit === 'count') return { name: ingredient.name.trim(), quantity: Math.max(1, Math.ceil(scaledQuantity || 1)), amount: null, unit: null }
  return { name: ingredient.name.trim(), quantity: 1, amount: scaledQuantity, unit }
}

export function recipeMergeDecision(existingItems, incoming) {
  const key = incoming.name.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  const candidates = existingItems.map((item, index) => ({ item, index })).filter(({ item }) => item.name.trim().toLocaleLowerCase().replace(/\s+/g, ' ') === key && !item.isChecked)
  if (!incoming.unit) {
    const match = candidates.find(({ item }) => !item.unit && item.amount == null)
    return match ? { type: 'merge', index: match.index, quantity: match.item.quantity + incoming.quantity, amount: null, unit: null } : { type: 'separate' }
  }
  const compatible = candidates.find(({ item }) => normalizeRecipeUnit(item.unit) === incoming.unit && item.amount != null)
  if (compatible) return { type: 'merge', index: compatible.index, quantity: compatible.item.quantity, amount: Number(compatible.item.amount) + Number(incoming.amount || 0), unit: incoming.unit }
  // A single unmeasured item of the same name has no conflicting amount, so attach the recipe amount without changing its identity.
  const unmeasured = candidates.find(({ item }) => !item.unit && item.amount == null && item.quantity === 1)
  return unmeasured ? { type: 'merge', index: unmeasured.index, quantity: 1, amount: incoming.amount, unit: incoming.unit } : { type: 'separate' }
}

export function isUnmeasuredGroceryItem(item) {
  return item.amount == null && item.unit == null
}

export function groceryItemEditPayload(name, quantity, category, measurement) {
  const normalizedName = name.trim()
  const nextQuantity = Math.max(1, Number(quantity) || 1)
  return { name: normalizedName, quantity: measurement ? 1 : nextQuantity, amount: measurement?.amount ?? null, unit: measurement?.unit?.trim() || null, category }
}

export function selectedRecipeGroceries(ingredients, baseServings, servings) {
  return ingredients.filter((item) => item.selected).map((item) => ({ ...groceryRecipeItem(item, scaleRecipeQuantity(item.quantity, baseServings, servings)), category: item.category }))
}

export function recipeSourceLink(sourceUrl) {
  if (typeof sourceUrl !== 'string' || !sourceUrl.trim()) return null
  try {
    const url = new URL(sourceUrl.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return { href: url.toString(), domain: url.hostname.replace(/^www\./i, '') }
  } catch {
    return null
  }
}

export function dedupeRecipeIngredients(ingredients) {
  const seen = new Set()
  return ingredients.filter((item) => {
    const key = item.name.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function saveRecipeWithRollback({ createRecipe, createIngredients, deleteRecipe }, recipe, ingredients) {
  const created = await createRecipe(recipe)
  try {
    await createIngredients(created.id, dedupeRecipeIngredients(ingredients))
    return created
  } catch (error) {
    try { await deleteRecipe(created.id) } catch (rollbackError) {
      throw new Error(`Ingredient save failed and recipe rollback failed: ${rollbackError instanceof Error ? rollbackError.message : 'unknown rollback error'}`, { cause: error })
    }
    throw error
  }
}
