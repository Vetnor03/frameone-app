export type RecipeIngredient = {
  name: string
  quantity: number | null
  unit: string | null
  category: string
}

export type RecipeDraft = {
  name: string
  sourceUrl: string | null
  servings: number | null
  ingredients: RecipeIngredient[]
}

export function parseManualIngredients(value: string): RecipeIngredient[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+(?:[.,]\d+)?)\s*([\p{L}]+)?\s+(.+)$/u)
    return match ? {
      name: match[3].trim(), quantity: Number(match[1].replace(',', '.')), unit: match[2]?.trim() || null, category: 'other',
    } : { name: line, quantity: null, unit: null, category: 'other' }
  })
}

export function scaleRecipeQuantity(quantity: number | null, baseServings: number | null, servings: number | null) {
  if (quantity == null || !baseServings || !servings) return quantity
  return Math.round(quantity * servings / baseServings * 100) / 100
}

export function groceryRecipeItem(ingredient: RecipeIngredient, scaledQuantity: number | null) {
  const countUnit = !ingredient.unit || /^(x|pc|pcs|piece|pieces|stk)$/i.test(ingredient.unit)
  if (countUnit) return { name: ingredient.name, quantity: Math.max(1, Math.round(scaledQuantity || 1)) }
  const amount = scaledQuantity == null ? '' : `${scaledQuantity} `
  return { name: `${ingredient.name} (${amount}${ingredient.unit})`, quantity: 1 }
}
