export type RecipeIngredient = { name: string; quantity: number | null; unit: string | null; category: string }
export type RecipeDraft = { name: string; sourceUrl: string | null; servings: number | null; ingredients: RecipeIngredient[] }
export type GroceryRecipeItem = { name: string; quantity: number; amount: number | null; unit: string | null }
export function normalizeRecipeUnit(unit: string | null): string | null
export function parseManualIngredients(value: string): RecipeIngredient[]
export function scaleRecipeQuantity(quantity: number | null, baseServings: number | null, servings: number | null): number | null
export function groceryRecipeItem(ingredient: RecipeIngredient, scaledQuantity: number | null): GroceryRecipeItem
export function recipeMergeDecision(existingItems: Array<{ name: string; quantity: number; amount?: number | null; unit?: string | null; isChecked?: boolean }>, incoming: GroceryRecipeItem): { type: 'merge'; index: number; quantity: number; amount: number | null; unit: string | null } | { type: 'separate' }
export function selectedRecipeGroceries(ingredients: Array<RecipeIngredient & { selected: boolean }>, baseServings: number | null, servings: number | null): Array<GroceryRecipeItem & { category: string }>
