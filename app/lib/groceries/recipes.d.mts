export type RecipeIngredient = { name: string; quantity: number | null; unit: string | null; category: string }
export type RecipeDraft = { name: string; sourceUrl: string | null; servings: number | null; ingredients: RecipeIngredient[] }
export type GroceryRecipeItem = { name: string; quantity: number; amount: number | null; unit: string | null }
export function normalizeRecipeUnit(unit: string | null): string | null
export function parseManualIngredients(value: string): RecipeIngredient[]
export function scaleRecipeQuantity(quantity: number | null, baseServings: number | null, servings: number | null): number | null
export function groceryRecipeItem(ingredient: RecipeIngredient, scaledQuantity: number | null): GroceryRecipeItem
export function recipeMergeDecision(existingItems: Array<{ name: string; quantity: number; amount?: number | null; unit?: string | null; isChecked?: boolean }>, incoming: GroceryRecipeItem): { type: 'merge'; index: number; quantity: number; amount: number | null; unit: string | null } | { type: 'separate' }
export function isUnmeasuredGroceryItem(item: { amount?: number | null; unit?: string | null }): boolean
export function groceryItemEditPayload<TCategory>(name: string, quantity: number, category: TCategory, measurement?: { amount: number; unit: string }): { name: string; quantity: number; amount: number | null; unit: string | null; category: TCategory }
export function selectedRecipeGroceries(ingredients: Array<RecipeIngredient & { selected: boolean }>, baseServings: number | null, servings: number | null): Array<GroceryRecipeItem & { category: string }>
export function dedupeRecipeIngredients<T extends { name: string }>(ingredients: T[]): T[]
export function saveRecipeWithRollback<TRecipe, TCreated extends { id: string }, TIngredient>(operations: { createRecipe: (recipe: TRecipe) => Promise<TCreated>; createIngredients: (recipeId: string, ingredients: TIngredient[]) => Promise<unknown>; deleteRecipe: (recipeId: string) => Promise<unknown> }, recipe: TRecipe, ingredients: TIngredient[]): Promise<TCreated>
