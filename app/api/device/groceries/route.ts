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
const GROCERY_CHECKED_RETENTION_MS = 10 * 60 * 1000
const RUNNING_LOW_PURCHASE_COOLDOWN_DAYS = 7

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

function addUniqueName(target: Map<string, string>, value: unknown, maxLength = 28) {
  const name = compactInsightName(value, maxLength)
  if (!name) return
  const key = normalizeInsightKey(name)
  if (!target.has(key)) target.set(key, name)
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

function buildRecipeInsights(
  items: GroceryPayload['items'],
  dinnerPlan: GroceryPayload['dinner_plan'],
  dinnerRows: Array<Record<string, unknown>>,
): GroceryPayload['insights']['recipes'] {
  const available = new Set(items.map((item) => normalizeInsightKey(item.name)))
  const plannedTitles = new Set(dinnerPlan.map((day) => normalizeInsightKey(day.title)))
  const candidates = new Map<string, { name: string; missing: string[]; score: number; lastDate: string }>()

  for (const row of dinnerRows) {
    const name = compactMealName(row?.title)
    if (!name) continue
    const key = normalizeInsightKey(name)
    if (plannedTitles.has(key)) continue

    const ingredientMap = new Map<string, string>()
    for (const item of parseDinnerPlanNoteItems(row?.note)) addUniqueName(ingredientMap, item.name)
    const ingredients = [...ingredientMap.entries()]
    if (ingredients.length < 2) continue

    const missing = ingredients.filter(([ingredientKey]) => !available.has(ingredientKey)).map(([, ingredientName]) => ingredientName)
    const overlap = ingredients.length - missing.length
    if (overlap < 1 || missing.length < 1 || missing.length > RECIPE_MISSING_MAX) continue

    const date = asString(row?.date, '').slice(0, 10)
    const score = overlap * 2 + ingredients.length - missing.length + (date ? 1 : 0)
    const existing = candidates.get(key)
    if (!existing || score > existing.score || date > existing.lastDate) {
      candidates.set(key, { name, missing: missing.slice(0, RECIPE_MISSING_MAX), score, lastDate: date })
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name))
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
      .select('name, usage_count, last_used_at')
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
    const sources = await loadInsightSourceRows(params.supabase, params.storageDeviceIds)
    const dinnerInsightRows = [...params.dinnerRows, ...sources.dinnerHistoryRows]
    const running_low = buildRunningLowInsight(params.language, params.items, dinnerInsightRows, sources)
    const recipes = buildRecipeInsights(params.items, params.dinnerPlan, dinnerInsightRows)
    console.log('GROCERIES_INSIGHTS', {
      runningLow: running_low.length,
      recipes: recipes.length,
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
