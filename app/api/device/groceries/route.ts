import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ITEMS = 40
const MAX_DINNER_PLAN = 14
const MAX_INSIGHT_HISTORY = 80
const RUNNING_LOW_MAX = 3
const RECIPE_MAX = 2
const RECIPE_MISSING_MAX = 2
const RECIPE_SOURCE_MAX = 200
const STORED_SUGGESTION_MAX = 8
const GROCERY_CHECKED_RETENTION_MS = 10 * 60 * 1000
const RUNNING_LOW_PURCHASE_COOLDOWN_DAYS = 7
const LIKELY_AVAILABLE_RECENT_PURCHASE_DAYS = 21
const LIKELY_AVAILABLE_HISTORY_DAYS = 45
const MIN_LEARNED_AVAILABLE_DAYS = 1
const MAX_LEARNED_AVAILABLE_DAYS = 180
const MS_PER_DAY = 24 * 60 * 60 * 1000

type GroceryPayload = {
  ok: true
  language: string
  items: Array<{ name: string; quantity: number }>
  dinner_plan: Array<{ date: string; title: string }>
  insights: {
    running_low: Array<{ name: string; label: string }>
    recipes: Array<{ name: string; missing: string[] }>
  }
  updated_at: string
}

type GroceryItemPayloadItem = GroceryPayload['items'][number]

type DinnerPlanNoteItem = {
  name: string
  quantity: number
  isChecked: boolean
}

type InsightSourceRows = {
  historyRows: Array<Record<string, unknown>>
  checkedRows: Array<Record<string, unknown>>
  dinnerHistoryRows: Array<Record<string, unknown>>
}

type StoredRecipeSuggestion = {
  name: string
  missing: string[]
  score: number
  updatedAt: string
}

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function asString(value: unknown, def = '') {
  return typeof value === 'string' ? value : def
}

function isIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

function checkedGroceryCutoffIso(nowMs = Date.now()) {
  return new Date(nowMs - GROCERY_CHECKED_RETENTION_MS).toISOString()
}

function clampQuantity(value: unknown) {
  const n = Number(value ?? 1)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.max(1, Math.round(n))
}

function normalizeItemKey(name: string) {
  return name.trim().toLocaleLowerCase()
}

function addPayloadItem(
  aggregate: Map<string, GroceryItemPayloadItem>,
  item: GroceryItemPayloadItem,
) {
  const name = item.name.trim().slice(0, 80)
  if (!name) return
  const quantity = clampQuantity(item.quantity)
  const key = normalizeItemKey(name)
  const existing = aggregate.get(key)

  if (existing) {
    // Dinner-plan items are eventually synced into grocery_items by the app. Use the
    // highest matching quantity instead of summing duplicates from both sources.
    existing.quantity = Math.max(existing.quantity, quantity)
    return
  }

  aggregate.set(key, { name, quantity })
}

function parseDinnerPlanNoteItems(note: unknown): DinnerPlanNoteItem[] {
  if (typeof note !== 'string' || !note.trim()) return []

  try {
    const parsed = JSON.parse(note) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null
        const row = item as Record<string, unknown>
        const name = asString(row.name, '').trim().slice(0, 80)
        if (!name) return null
        return {
          name,
          quantity: clampQuantity(row.quantity),
          isChecked: row.isChecked === true || row.is_checked === true,
        }
      })
      .filter(Boolean) as DinnerPlanNoteItem[]
  } catch {
    return []
  }
}


function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function isIsoAtOrAfter(value: string, cutoffIso: string) {
  return !!value && value >= cutoffIso
}

function compactInsightName(value: unknown, maxLength = 28) {
  const name = asString(value, '').replace(/\s+/g, ' ').trim()
  if (!name || name.length > maxLength) return ''
  return name
}

function compactMealName(value: unknown) {
  return compactInsightName(value, 32)
}

function normalizeInsightKey(name: string) {
  return name.trim().toLocaleLowerCase()
}

function normalizeIngredientKey(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keysAreIngredientMatch(recipeIngredientKey: string, availableKey: string) {
  if (!recipeIngredientKey || !availableKey) return false
  if (recipeIngredientKey === availableKey) return true
  return availableKey.includes(recipeIngredientKey) || recipeIngredientKey.includes(availableKey)
}

function addUniqueName(target: Map<string, string>, value: unknown, maxLength = 28) {
  const name = compactInsightName(value, maxLength)
  if (!name) return
  const key = normalizeIngredientKey(name)
  if (!target.has(key)) target.set(key, name)
}

function maybeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function recipeNameFromRow(row: Record<string, unknown>) {
  return compactMealName(row.name) || compactMealName(row.title) || compactMealName(row.recipe_name)
}

function addRecipeIngredient(target: Map<string, string>, value: unknown) {
  if (typeof value === 'string') {
    const parsed = value.trim().startsWith('[') || value.trim().startsWith('{') ? maybeParseJson(value) : value
    if (parsed !== value) {
      addRecipeIngredients(target, parsed)
      return
    }

    for (const part of value.split(/[\n,;]+/)) addUniqueName(target, part)
    return
  }

  if (!value || typeof value !== 'object') return
  const row = value as Record<string, unknown>
  addUniqueName(target, row.name ?? row.title ?? row.ingredient ?? row.item)
}

function addRecipeIngredients(target: Map<string, string>, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) addRecipeIngredient(target, item)
    return
  }

  if (typeof value === 'string') {
    addRecipeIngredient(target, value)
    return
  }

  if (!value || typeof value !== 'object') return
  const row = value as Record<string, unknown>
  for (const key of ['ingredients', 'items', 'grocery_items', 'ingredient_names']) {
    if (key in row) addRecipeIngredients(target, row[key])
  }
}

function recipeIngredientsFromRow(row: Record<string, unknown>) {
  const ingredientMap = new Map<string, string>()
  addRecipeIngredients(ingredientMap, row.ingredients)
  addRecipeIngredients(ingredientMap, row.items)
  addRecipeIngredients(ingredientMap, row.grocery_items)
  addRecipeIngredients(ingredientMap, row.ingredient_names)
  return [...ingredientMap.entries()]
}

function recipeAppliesToDevice(row: Record<string, unknown>, storageDeviceIds: string[]) {
  const recipeDeviceId = asString(row.device_id, '').trim()
  return !recipeDeviceId || storageDeviceIds.includes(recipeDeviceId)
}

function recipeIsActive(row: Record<string, unknown>) {
  if (row.is_active === false || row.active === false || row.archived === true) return false
  return true
}

function labelForRunningLow(language: string) {
  return language.toLocaleLowerCase().startsWith('no') || language.toLocaleLowerCase().startsWith('nb') || language.toLocaleLowerCase().startsWith('nn')
    ? 'Lav snart'
    : 'Low soon'
}

function buildRunningLowInsight(
  language: string,
  items: GroceryPayload['items'],
  dinnerRows: Array<Record<string, unknown>>,
  sources: Pick<InsightSourceRows, 'historyRows' | 'checkedRows'>,
): GroceryPayload['insights']['running_low'] {
  const activeKeys = new Set(items.map((item) => normalizeInsightKey(item.name)))
  const recentPurchaseCutoffIso = daysAgoIso(RUNNING_LOW_PURCHASE_COOLDOWN_DAYS)
  const recentlyPurchasedKeys = new Set<string>()
  const scores = new Map<string, { name: string; score: number; signals: number; lastUsed: string }>()

  for (const row of sources.historyRows) {
    const name = compactInsightName(row?.name)
    const lastUsed = asString(row?.last_used_at, '')
    if (name && isIsoAtOrAfter(lastUsed, recentPurchaseCutoffIso)) {
      recentlyPurchasedKeys.add(normalizeInsightKey(name))
    }
  }

  for (const row of sources.checkedRows) {
    const name = compactInsightName(row?.name)
    const checkedAt = asString(row?.checked_at, '') || asString(row?.updated_at, '')
    if (name && isIsoAtOrAfter(checkedAt, recentPurchaseCutoffIso)) {
      recentlyPurchasedKeys.add(normalizeInsightKey(name))
    }
  }

  const addScore = (nameValue: unknown, score: number, signal: boolean, lastUsed = '') => {
    const name = compactInsightName(nameValue)
    if (!name) return
    const key = normalizeInsightKey(name)
    if (activeKeys.has(key) || recentlyPurchasedKeys.has(key)) return
    const existing = scores.get(key) || { name, score: 0, signals: 0, lastUsed: '' }
    existing.score += score
    if (signal) existing.signals += 1
    if (lastUsed && lastUsed > existing.lastUsed) existing.lastUsed = lastUsed
    scores.set(key, existing)
  }

  for (const row of sources.historyRows) {
    const usageCount = Math.max(0, Number(row?.usage_count ?? 0) || 0)
    const lastUsed = asString(row?.last_used_at, '')
    if (usageCount < 2) continue
    addScore(row?.name, Math.min(8, usageCount * 2), true, lastUsed)
  }

  const checkedCounts = new Map<string, { name: string; count: number; lastUsed: string }>()
  for (const row of sources.checkedRows) {
    const name = compactInsightName(row?.name)
    if (!name) continue
    const key = normalizeInsightKey(name)
    if (activeKeys.has(key) || recentlyPurchasedKeys.has(key)) continue
    const checkedAt = asString(row?.checked_at, '') || asString(row?.updated_at, '')
    const existing = checkedCounts.get(key) || { name, count: 0, lastUsed: '' }
    existing.count += 1
    if (checkedAt && checkedAt > existing.lastUsed) existing.lastUsed = checkedAt
    checkedCounts.set(key, existing)
  }
  for (const entry of checkedCounts.values()) {
    if (entry.count < 2) continue
    addScore(entry.name, Math.min(6, entry.count * 3), true, entry.lastUsed)
  }

  const dinnerIngredientCounts = new Map<string, { name: string; count: number }>()
  for (const row of dinnerRows) {
    for (const item of parseDinnerPlanNoteItems(row?.note)) {
      const name = compactInsightName(item.name)
      if (!name) continue
      const key = normalizeInsightKey(name)
      if (activeKeys.has(key) || recentlyPurchasedKeys.has(key)) continue
      const existing = dinnerIngredientCounts.get(key) || { name, count: 0 }
      existing.count += 1
      dinnerIngredientCounts.set(key, existing)
    }
  }
  for (const entry of dinnerIngredientCounts.values()) {
    if (entry.count < 2) continue
    addScore(entry.name, Math.min(4, entry.count), true)
  }

  const label = labelForRunningLow(language)
  return [...scores.values()]
    .filter((item) => item.score >= 4 && item.signals > 0)
    .sort((a, b) => b.score - a.score || b.lastUsed.localeCompare(a.lastUsed) || a.name.localeCompare(b.name))
    .slice(0, RUNNING_LOW_MAX)
    .map((item) => ({ name: item.name, label }))
}

function rowArray(data: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(data) ? data : [])
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
}

async function loadLegacyRecipeRows(supabase: SupabaseClient, storageDeviceIds: string[]) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .limit(RECIPE_SOURCE_MAX)

  if (error) {
    console.error('/api/device/groceries legacy recipes query failed', { error })
    return []
  }

  return rowArray(data).filter((row) => recipeAppliesToDevice(row, storageDeviceIds) && recipeIsActive(row))
}

async function loadGroceryRecipeRows(supabase: SupabaseClient, storageDeviceIds: string[]) {
  const { data: recipeData, error: recipeError } = await supabase
    .from('grocery_recipes')
    .select('id, device_id, name, locale, is_active, created_at, updated_at')
    .limit(RECIPE_SOURCE_MAX)

  if (recipeError) {
    console.error('/api/device/groceries grocery_recipes query failed', { error: recipeError })
    return []
  }

  const recipes = rowArray(recipeData).filter((row) => recipeAppliesToDevice(row, storageDeviceIds) && recipeIsActive(row))
  const recipeIds = recipes.map((row) => asString(row.id, '').trim()).filter(Boolean)
  if (recipeIds.length <= 0) return recipes

  const { data: ingredientData, error: ingredientError } = await supabase
    .from('grocery_recipe_ingredients')
    .select('recipe_id, name, ingredient, item')
    .in('recipe_id', recipeIds)
    .limit(RECIPE_SOURCE_MAX * 8)

  if (ingredientError) {
    console.error('/api/device/groceries grocery_recipe_ingredients query failed', { error: ingredientError })
    return recipes
  }

  const ingredientsByRecipe = new Map<string, Array<Record<string, unknown>>>()
  for (const ingredient of rowArray(ingredientData)) {
    const recipeId = asString(ingredient.recipe_id, '').trim()
    if (!recipeId) continue
    const list = ingredientsByRecipe.get(recipeId) || []
    list.push(ingredient)
    ingredientsByRecipe.set(recipeId, list)
  }

  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: ingredientsByRecipe.get(asString(recipe.id, '').trim()) || [],
  }))
}

function builtInRecipeRows() {
  return [
    { name: 'Pasta with tomato sauce', ingredients: ['pasta', 'tomato', 'cheese'] },
    { name: 'Chicken rice bowl', ingredients: ['chicken', 'rice', 'vegetables'] },
    { name: 'Taco dinner', ingredients: ['tortilla', 'minced meat', 'cheese', 'tomato'] },
    { name: 'Salmon potatoes', ingredients: ['salmon', 'potatoes', 'broccoli'] },
    { name: 'Omelette', ingredients: ['eggs', 'cheese', 'ham'] },
    { name: 'Yoghurt bowl', ingredients: ['yoghurt', 'banan'] },
    { name: 'Fried rice', ingredients: ['rice', 'eggs', 'vegetables'] },
    { name: 'Soup and bread', ingredients: ['soup', 'bread'] },
  ]
}

async function loadRecipeRows(supabase: SupabaseClient, storageDeviceIds: string[]) {
  const [groceryRows, legacyRows] = await Promise.all([
    loadGroceryRecipeRows(supabase, storageDeviceIds),
    loadLegacyRecipeRows(supabase, storageDeviceIds),
  ])

  const combined = [...groceryRows, ...legacyRows]
  return combined.length > 0 ? combined : builtInRecipeRows()
}

function parseMissingList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => compactInsightName(item, 28)).filter(Boolean).slice(0, RECIPE_MISSING_MAX)
  if (typeof value === 'string') {
    const parsed = value.trim().startsWith('[') ? maybeParseJson(value) : value
    if (Array.isArray(parsed)) return parseMissingList(parsed)
    return value.split(/[,;\n]+/).map((item) => compactInsightName(item, 28)).filter(Boolean).slice(0, RECIPE_MISSING_MAX)
  }
  return []
}

async function loadStoredRecipeSuggestions(supabase: SupabaseClient, storageDeviceIds: string[]): Promise<StoredRecipeSuggestion[]> {
  const { data, error } = await supabase
    .from('grocery_recipe_suggestions')
    .select('name, missing, score, updated_at, created_at, expires_at')
    .in('device_id', storageDeviceIds)
    .order('score', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(STORED_SUGGESTION_MAX)

  if (error) {
    console.error('/api/device/groceries grocery_recipe_suggestions query failed', { error })
    return []
  }

  const nowIso = new Date().toISOString()
  return rowArray(data)
    .filter((row) => {
      const expiresAt = asString(row.expires_at, '')
      return !expiresAt || expiresAt > nowIso
    })
    .map((row) => ({
      name: recipeNameFromRow(row),
      missing: parseMissingList(row.missing),
      score: Number(row.score ?? 0) || 0,
      updatedAt: asString(row.updated_at, '') || asString(row.created_at, ''),
    }))
    .filter((row) => row.name)
}

function learnedAvailableDays(row: Record<string, unknown>) {
  const n = Number(row.average_days_available)
  if (!Number.isFinite(n)) return null
  return Math.max(MIN_LEARNED_AVAILABLE_DAYS, Math.min(MAX_LEARNED_AVAILABLE_DAYS, n))
}

function ageInDays(isoValue: string) {
  const then = new Date(isoValue).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, (Date.now() - then) / MS_PER_DAY)
}

function buildLikelyAvailableIngredientScores(sources: Pick<InsightSourceRows, 'historyRows' | 'checkedRows'>) {
  const recentPurchaseCutoffIso = daysAgoIso(LIKELY_AVAILABLE_RECENT_PURCHASE_DAYS)
  const historyCutoffIso = daysAgoIso(LIKELY_AVAILABLE_HISTORY_DAYS)
  const scores = new Map<string, { name: string; score: number; lastUsed: string }>()

  const addScore = (nameValue: unknown, score: number, lastUsed = '') => {
    const name = compactInsightName(nameValue)
    if (!name) return
    const key = normalizeIngredientKey(name)
    const existing = scores.get(key) || { name, score: 0, lastUsed: '' }
    existing.score += score
    if (lastUsed && lastUsed > existing.lastUsed) existing.lastUsed = lastUsed
    scores.set(key, existing)
  }

  for (const row of sources.historyRows) {
    const usageCount = Math.max(0, Number(row?.usage_count ?? 0) || 0)
    const lastUsed = asString(row?.last_used_at, '')
    const lastPurchased = asString(row?.last_purchased_at, '') || lastUsed
    if (usageCount < 2 || !isIsoAtOrAfter(lastUsed, historyCutoffIso)) continue

    const averageDaysAvailable = learnedAvailableDays(row)
    if (averageDaysAvailable != null && lastPurchased) {
      const ageDays = ageInDays(lastPurchased)
      if (ageDays == null || ageDays > averageDaysAvailable) continue

      const remainingRatio = Math.max(0.15, (averageDaysAvailable - ageDays) / averageDaysAvailable)
      const learnedFreshnessScore = Math.ceil(remainingRatio * 8)
      addScore(row?.name, Math.min(10, usageCount) + learnedFreshnessScore, lastPurchased)
      continue
    }

    addScore(row?.name, Math.min(10, usageCount) + (isIsoAtOrAfter(lastUsed, recentPurchaseCutoffIso) ? 4 : 0), lastUsed)
  }

  for (const row of sources.checkedRows) {
    const checkedAt = asString(row?.checked_at, '') || asString(row?.updated_at, '')
    if (!isIsoAtOrAfter(checkedAt, recentPurchaseCutoffIso)) continue
    addScore(row?.name, 8, checkedAt)
  }

  return scores
}

function buildRecipeInsights(
  sources: Pick<InsightSourceRows, 'historyRows' | 'checkedRows'>,
  dinnerPlan: GroceryPayload['dinner_plan'],
  recipeRows: Array<Record<string, unknown>>,
  storedSuggestions: StoredRecipeSuggestion[] = [],
): GroceryPayload['insights']['recipes'] {
  const likelyAvailable = buildLikelyAvailableIngredientScores(sources)
  const plannedTitles = new Set(dinnerPlan.map((day) => normalizeInsightKey(day.title)))
  const candidates = new Map<string, { name: string; missing: string[]; score: number; updatedAt: string }>()

  for (const row of storedSuggestions) {
    const key = normalizeInsightKey(row.name)
    if (!key || plannedTitles.has(key)) continue
    candidates.set(key, { name: row.name, missing: row.missing, score: row.score + 1000, updatedAt: row.updatedAt })
  }

  for (const row of recipeRows) {
    const name = recipeNameFromRow(row)
    if (!name) continue
    const key = normalizeInsightKey(name)
    if (plannedTitles.has(key)) continue

    const ingredients = recipeIngredientsFromRow(row)
    if (ingredients.length < 2) continue

    const ingredientMatches = ingredients.map(([ingredientKey, ingredientName]) => {
      const matched = [...likelyAvailable.entries()].find(([availableKey]) => keysAreIngredientMatch(ingredientKey, availableKey))
      return { ingredientName, score: matched?.[1].score ?? 0 }
    })
    const matchedIngredientScores = ingredientMatches.map((match) => match.score).filter((score) => score > 0)
    const missing = ingredientMatches.filter((match) => match.score <= 0).map((match) => match.ingredientName)
    const overlap = matchedIngredientScores.length
    if (overlap < 1 || missing.length > RECIPE_MISSING_MAX) continue

    const learnedScore = matchedIngredientScores.reduce((total, score) => total + score, 0)
    const updatedAt = asString(row.updated_at, '') || asString(row.created_at, '')
    const score = learnedScore + overlap * 3 + ingredients.length - missing.length + (updatedAt ? 1 : 0)
    const existing = candidates.get(key)
    if (!existing || score > existing.score || updatedAt > existing.updatedAt) {
      candidates.set(key, { name, missing: missing.slice(0, RECIPE_MISSING_MAX), score, updatedAt })
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name))
    .slice(0, RECIPE_MAX)
    .map((recipe) => ({ name: recipe.name, missing: recipe.missing }))
}

async function loadInsightSourceRows(
  supabase: SupabaseClient,
  storageDeviceIds: string[],
): Promise<InsightSourceRows> {
  const sinceCheckedIso = daysAgoIso(90)
  const sinceDinnerIso = isoDateOnly(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))

  const [historyResult, checkedResult, dinnerHistoryResult] = await Promise.allSettled([
    supabase
      .from('grocery_item_history')
      .select('name, usage_count, last_used_at, last_purchased_at, average_days_available')
      .in('device_id', storageDeviceIds)
      .gte('last_used_at', daysAgoIso(180))
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(MAX_INSIGHT_HISTORY),
    supabase
      .from('grocery_items')
      .select('name, checked_at, updated_at')
      .in('device_id', storageDeviceIds)
      .eq('is_checked', true)
      .gte('checked_at', sinceCheckedIso)
      .order('checked_at', { ascending: false })
      .limit(MAX_INSIGHT_HISTORY),
    supabase
      .from('dinner_plan_days')
      .select('date, title, note')
      .in('device_id', storageDeviceIds)
      .gte('date', sinceDinnerIso)
      .order('date', { ascending: false })
      .limit(MAX_INSIGHT_HISTORY),
  ])

  const rowsFrom = (result: PromiseSettledResult<{ data: unknown; error: { message?: string } | null }>) => {
    if (result.status !== 'fulfilled' || result.value.error || !Array.isArray(result.value.data)) return []
    return result.value.data as Array<Record<string, unknown>>
  }

  return {
    historyRows: rowsFrom(historyResult),
    checkedRows: rowsFrom(checkedResult),
    dinnerHistoryRows: rowsFrom(dinnerHistoryResult),
  }
}

async function buildGroceryInsights(params: {
  supabase: SupabaseClient
  storageDeviceIds: string[]
  language: string
  items: GroceryPayload['items']
  dinnerPlan: GroceryPayload['dinner_plan']
  dinnerRows: Array<Record<string, unknown>>
}): Promise<GroceryPayload['insights']> {
  try {
    const [sources, recipeRows, storedSuggestions] = await Promise.all([
      loadInsightSourceRows(params.supabase, params.storageDeviceIds),
      loadRecipeRows(params.supabase, params.storageDeviceIds),
      loadStoredRecipeSuggestions(params.supabase, params.storageDeviceIds),
    ])
    const dinnerInsightRows = [...params.dinnerRows, ...sources.dinnerHistoryRows]
    const running_low = buildRunningLowInsight(params.language, params.items, dinnerInsightRows, sources)
    const recipes = buildRecipeInsights(sources, params.dinnerPlan, recipeRows, storedSuggestions)
    console.log('GROCERIES_INSIGHTS', {
      runningLow: running_low.length,
      recipes: recipes.length,
      recipeRows: recipeRows.length,
      storedSuggestions: storedSuggestions.length,
      historyRows: sources.historyRows.length,
      checkedRows: sources.checkedRows.length,
    })
    return { running_low, recipes }
  } catch {
    const running_low: GroceryPayload['insights']['running_low'] = []
    const recipes: GroceryPayload['insights']['recipes'] = []
    console.log('GROCERIES_INSIGHTS', {
      runningLow: running_low.length,
      recipes: recipes.length,
    })
    return { running_low, recipes }
  }
}

function jsonErrorResponse(payload: { error: string }, init: { status: number }) {
  const json = JSON.stringify(payload)
  return new NextResponse(json, {
    status: init.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function jsonResponse(payload: GroceryPayload) {
  const json = JSON.stringify(payload)
  return new NextResponse(json, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = String(url.searchParams.get('device_id') || '').trim()
    if (!device_id) {
      return jsonErrorResponse({ error: 'Missing device_id' }, { status: 400 })
    }

    const token = getBearerToken(req)
    if (!token) {
      return jsonErrorResponse({ error: 'Missing bearer token' }, { status: 401 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, device_id, device_token')
      .eq('device_id', device_id)
      .maybeSingle()

    if (deviceError) {
      console.error('/api/device/groceries devices query failed', { device_id, error: deviceError })
    }

    if (deviceError || !device || device.device_token !== token) {
      return jsonErrorResponse({ error: 'Unauthorized' }, { status: 401 })
    }

    const appStorageDeviceId = String((device as Record<string, unknown>).id ?? '').trim()
    const storageDeviceIds = Array.from(new Set([appStorageDeviceId, device_id].filter(Boolean)))
    const todayIso = isoDateOnly(new Date())

    const { error: cleanupError } = await supabase
      .from('grocery_items')
      .delete()
      .in('device_id', storageDeviceIds)
      .eq('is_checked', true)
      .lte('checked_at', checkedGroceryCutoffIso())

    if (cleanupError) {
      console.error('/api/device/groceries cleanup expired checked items failed', { device_id, error: cleanupError })
    }

    const [settingsResult, itemsResult, dinnerResult] = await Promise.allSettled([
      supabase
        .from('device_settings')
        .select('settings_json, updated_at, device_id')
        .in('device_id', storageDeviceIds)
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('grocery_items')
        .select('name, quantity, updated_at')
        .in('device_id', storageDeviceIds)
        .eq('is_checked', false)
        .order('updated_at', { ascending: false })
        .limit(MAX_ITEMS),
      supabase
        .from('dinner_plan_days')
        .select('date, title, note')
        .in('device_id', storageDeviceIds)
        .gte('date', todayIso)
        .order('date', { ascending: true })
        .limit(MAX_DINNER_PLAN),
    ])

    if (settingsResult.status === 'rejected') {
      return jsonErrorResponse({ error: String(settingsResult.reason) }, { status: 500 })
    }

    const { data: settingsRows, error: settingsError } = settingsResult.value
    if (settingsError) {
      console.error('/api/device/groceries device_settings query failed', { device_id, error: settingsError })
      return jsonErrorResponse({ error: settingsError.message }, { status: 500 })
    }

    const settingsData = Array.isArray(settingsRows) ? settingsRows[0] : null
    const settings = settingsData?.settings_json && typeof settingsData.settings_json === 'object' ? settingsData.settings_json as Record<string, unknown> : {}
    const language = asString(settings.language, 'en').slice(0, 16) || 'en'

    if (itemsResult.status === 'rejected') {
      return jsonErrorResponse({ error: String(itemsResult.reason) }, { status: 500 })
    }
    if (dinnerResult.status === 'rejected') {
      return jsonErrorResponse({ error: String(dinnerResult.reason) }, { status: 500 })
    }

    const { data: itemRows, error: itemsError } = itemsResult.value
    if (itemsError) {
      console.error('/api/device/groceries grocery_items query failed', { device_id, error: itemsError })
      return jsonErrorResponse({ error: itemsError.message }, { status: 500 })
    }

    const { data: dinnerRows, error: dinnerError } = dinnerResult.value
    if (dinnerError) {
      console.error('/api/device/groceries dinner_plan_days query failed', { device_id, error: dinnerError })
      return jsonErrorResponse({ error: dinnerError.message }, { status: 500 })
    }

    const itemAggregate = new Map<string, GroceryItemPayloadItem>()

    for (const row of itemRows || []) {
      addPayloadItem(itemAggregate, {
        name: asString(row?.name, '').trim().slice(0, 80),
        quantity: clampQuantity(row?.quantity),
      })
    }

    for (const row of dinnerRows || []) {
      const date = asString(row?.date, '').slice(0, 10)
      if (!isIsoDate(date) || date < todayIso) continue
      for (const item of parseDinnerPlanNoteItems(row?.note)) {
        if (item.isChecked) continue
        addPayloadItem(itemAggregate, item)
      }
    }

    const items = [...itemAggregate.values()].slice(0, MAX_ITEMS)

    const dinner_plan = (dinnerRows || [])
      .map((row: Record<string, unknown>) => ({
        date: asString(row?.date, '').slice(0, 10),
        title: asString(row?.title, '').trim().slice(0, 80),
      }))
      .filter((row: { date: string; title: string }) => isIsoDate(row.date) && row.date >= todayIso && !!row.title)
      .slice(0, MAX_DINNER_PLAN)

    const insights = await buildGroceryInsights({
      supabase,
      storageDeviceIds,
      language,
      items,
      dinnerPlan: dinner_plan,
      dinnerRows: (dinnerRows || []) as Array<Record<string, unknown>>,
    })

    const updatedCandidates = [
      settingsData?.updated_at ? String(settingsData.updated_at) : '',
      ...(itemRows || []).map((row: Record<string, unknown>) => asString(row?.updated_at, '')),
    ].filter(Boolean)

    const updated_at = updatedCandidates.sort().at(-1) || new Date().toISOString()

    return jsonResponse({
      ok: true,
      language,
      items,
      dinner_plan,
      insights,
      updated_at,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return jsonErrorResponse({ error: message }, { status: 500 })
  }
}
