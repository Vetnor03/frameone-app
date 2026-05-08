import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ITEMS = 40
const MAX_DINNER_PLAN = 14
const MAX_RUNNING_LOW = 3
const MAX_RECIPES = 2
const MAX_MISSING_PER_RECIPE = 2

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

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function asString(value: unknown, def = '') {
  return typeof value === 'string' ? value : def
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((x) => asString(x, '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map((x) => asString(x, '').trim()).filter(Boolean)
    } catch {
      // Plain comma-separated strings are accepted from display-ready views.
    }
    return trimmed.split(',').map((x) => x.trim()).filter(Boolean)
  }
  return []
}

function firstString(row: Record<string, unknown> | null | undefined, keys: string[], def = '') {
  for (const key of keys) {
    const value = asString(row?.[key], '').trim()
    if (value) return value
  }
  return def
}

function isIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
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

function groceryStatusLabel(status: string, language: string) {
  const normalized = status.trim().toLowerCase()
  const noLabels: Record<string, string> = {
    due_soon: 'Snart tomt',
    overdue: 'Pleier å trengs',
    probably_out: 'På handlelisten',
    learning: 'Lærer mønster',
  }
  const enLabels: Record<string, string> = {
    due_soon: 'Due soon',
    overdue: 'Usually needed',
    probably_out: 'On list',
    learning: 'Learning pattern',
  }
  const isNorwegian = language === 'no' || language === 'nb' || language === 'nb-NO'
  const labels = isNorwegian ? noLabels : enLabels
  return labels[normalized] || (isNorwegian ? 'Følger med' : 'Watching')
}

function logFinalJsonResponse(json: string, context: Record<string, unknown>) {
  console.info('GROCERIES_DIAG_FINAL_RESPONSE', { ...context, json })
  console.info('/api/device/groceries response body', json)
}

function jsonErrorResponse(payload: { error: string }, init: { status: number }, context: Record<string, unknown> = {}) {
  const json = JSON.stringify(payload)
  logFinalJsonResponse(json, { ...context, status: init.status })
  return new NextResponse(json, {
    status: init.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function jsonResponse(payload: GroceryPayload, deviceId: string) {
  const json = JSON.stringify(payload)
  const bytes = Buffer.byteLength(json, 'utf8')
  console.info('/api/device/groceries response size', { device_id: deviceId, bytes })
  console.info('/api/device/groceries final items count', { device_id: deviceId, items: payload.items.length })
  logFinalJsonResponse(json, { device_id: deviceId, status: 200 })
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
    console.info('/api/device/groceries device_id received', { device_id })

    if (!device_id) {
      return jsonErrorResponse({ error: 'Missing device_id' }, { status: 400 }, { device_id })
    }

    const token = getBearerToken(req)
    if (!token) {
      return jsonErrorResponse({ error: 'Missing bearer token' }, { status: 401 }, { device_id })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, device_id, device_token')
      .eq('device_id', device_id)
      .maybeSingle()

    if (deviceError) {
      console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'devices', error: deviceError })
    }

    if (deviceError || !device || device.device_token !== token) {
      return jsonErrorResponse({ error: 'Unauthorized' }, { status: 401 }, { device_id })
    }

    console.info('/api/device/groceries resolved device', {
      received_device_id: device_id,
      resolved_device_id: device.device_id,
      internal_id: (device as Record<string, unknown>).id ?? null,
    })
    console.info('GROCERIES_DIAG_START', { device_id })

    const todayIso = isoDateOnly(new Date())

    const [settingsResult, itemsCountResult, activeItemsCountResult, dinnerCountResult, itemsResult, dinnerResult, runningLowResult, recipesResult] = await Promise.allSettled([
      supabase
        .from('device_settings')
        .select('settings_json, updated_at')
        .eq('device_id', device_id)
        .maybeSingle(),
      supabase
        .from('grocery_items')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', device_id),
      supabase
        .from('grocery_items')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', device_id)
        .eq('is_checked', false),
      supabase
        .from('dinner_plan_days')
        .select('date', { count: 'exact', head: true })
        .eq('device_id', device_id)
        .gte('date', todayIso),
      supabase
        .from('grocery_items')
        .select('name, quantity, updated_at')
        .eq('device_id', device_id)
        .eq('is_checked', false)
        .order('updated_at', { ascending: false })
        .limit(MAX_ITEMS),
      supabase
        .from('dinner_plan_days')
        .select('date, title, note')
        .eq('device_id', device_id)
        .gte('date', todayIso)
        .order('date', { ascending: true })
        .limit(MAX_DINNER_PLAN),
      supabase
        .from('grocery_running_low')
        .select('*')
        .eq('device_id', device_id)
        .limit(MAX_RUNNING_LOW),
      supabase
        .from('grocery_recipe_suggestions')
        .select('*')
        .eq('device_id', device_id)
        .limit(MAX_RECIPES),
    ])

    if (itemsCountResult.status === 'rejected') {
      console.error('Failed to count grocery_items rows', { device_id, error: itemsCountResult.reason })
    } else if (itemsCountResult.value.error) {
      console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'grocery_items_total_count', error: itemsCountResult.value.error })
      console.error('Failed to count grocery_items rows', { device_id, error: itemsCountResult.value.error })
    } else {
      console.info('GROCERIES_DIAG_COUNT_RESULT', { device_id, query: 'grocery_items_total_count', count: itemsCountResult.value.count ?? 0 })
      console.info('/api/device/groceries grocery_items rows found', { device_id, count: itemsCountResult.value.count ?? 0 })
    }

    if (activeItemsCountResult.status === 'rejected') {
      console.error('Failed to count active grocery_items rows', { device_id, error: activeItemsCountResult.reason })
    } else if (activeItemsCountResult.value.error) {
      console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'grocery_items_active_unchecked_count', error: activeItemsCountResult.value.error })
      console.error('Failed to count active grocery_items rows', { device_id, error: activeItemsCountResult.value.error })
    } else {
      console.info('GROCERIES_DIAG_COUNT_RESULT', { device_id, query: 'grocery_items_active_unchecked_count', count: activeItemsCountResult.value.count ?? 0 })
      console.info('/api/device/groceries active unchecked grocery_items rows found', { device_id, count: activeItemsCountResult.value.count ?? 0 })
    }

    if (dinnerCountResult.status === 'rejected') {
      console.error('Failed to count dinner_plan_days rows', { device_id, error: dinnerCountResult.reason })
    } else if (dinnerCountResult.value.error) {
      console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'dinner_plan_days_count', error: dinnerCountResult.value.error })
      console.error('Failed to count dinner_plan_days rows', { device_id, error: dinnerCountResult.value.error })
    } else {
      console.info('GROCERIES_DIAG_COUNT_RESULT', { device_id, query: 'dinner_plan_days_count', count: dinnerCountResult.value.count ?? 0 })
      console.info('/api/device/groceries dinner_plan_days rows found', { device_id, count: dinnerCountResult.value.count ?? 0 })
    }

    if (settingsResult.status === 'rejected') {
      return jsonErrorResponse({ error: String(settingsResult.reason) }, { status: 500 }, { device_id })
    }

    const { data: settingsData, error: settingsError } = settingsResult.value
    if (settingsError) {
      console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'device_settings', error: settingsError })
      return jsonErrorResponse({ error: settingsError.message }, { status: 500 }, { device_id })
    }

    const settings = settingsData?.settings_json && typeof settingsData.settings_json === 'object' ? settingsData.settings_json as Record<string, unknown> : {}
    const language = asString(settings.language, 'en').slice(0, 16) || 'en'

    if (itemsResult.status === 'rejected') {
      return jsonErrorResponse({ error: String(itemsResult.reason) }, { status: 500 }, { device_id })
    }
    if (dinnerResult.status === 'rejected') {
      return jsonErrorResponse({ error: String(dinnerResult.reason) }, { status: 500 }, { device_id })
    }

    const { data: itemRows, error: itemsError } = itemsResult.value
    if (itemsError) {
      console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'grocery_items_active_unchecked_rows', error: itemsError })
      return jsonErrorResponse({ error: itemsError.message }, { status: 500 }, { device_id })
    }

    const { data: dinnerRows, error: dinnerError } = dinnerResult.value
    if (dinnerError) {
      console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'dinner_plan_days_rows', error: dinnerError })
      return jsonErrorResponse({ error: dinnerError.message }, { status: 500 }, { device_id })
    }

    console.info('GROCERIES_DIAG_COUNT_RESULT', { device_id, query: 'grocery_items_active_unchecked_rows_loaded', count: (itemRows || []).length })
    console.info('/api/device/groceries active grocery_items rows loaded', { device_id, count: (itemRows || []).length })
    console.info('GROCERIES_DIAG_COUNT_RESULT', { device_id, query: 'dinner_plan_days_rows_loaded', count: (dinnerRows || []).length })
    console.info('/api/device/groceries dinner_plan_days rows found', { device_id, count: (dinnerRows || []).length })
    console.info('/api/device/groceries dinner_plan_days.note exists', {
      device_id,
      exists: (dinnerRows || []).some((row: Record<string, unknown>) => typeof row?.note === 'string' && !!row.note.trim()),
      rows_with_note: (dinnerRows || []).filter((row: Record<string, unknown>) => typeof row?.note === 'string' && !!row.note.trim()).length,
    })

    const itemAggregate = new Map<string, GroceryItemPayloadItem>()

    for (const row of itemRows || []) {
      addPayloadItem(itemAggregate, {
        name: asString(row?.name, '').trim().slice(0, 80),
        quantity: clampQuantity(row?.quantity),
      })
    }

    let parsedDinnerNoteGroceryCount = 0

    for (const row of dinnerRows || []) {
      const date = asString(row?.date, '').slice(0, 10)
      if (!isIsoDate(date) || date < todayIso) continue
      for (const item of parseDinnerPlanNoteItems(row?.note)) {
        if (item.isChecked) continue
        parsedDinnerNoteGroceryCount += 1
        addPayloadItem(itemAggregate, item)
      }
    }

    console.info('GROCERIES_DIAG_COUNT_RESULT', { device_id, query: 'parsed_dinner_note_grocery_count', count: parsedDinnerNoteGroceryCount })
    console.info('/api/device/groceries parsed grocery count from dinner notes', { device_id, count: parsedDinnerNoteGroceryCount })

    const items = [...itemAggregate.values()].slice(0, MAX_ITEMS)

    const dinner_plan = (dinnerRows || [])
      .map((row: Record<string, unknown>) => ({
        date: asString(row?.date, '').slice(0, 10),
        title: asString(row?.title, '').trim().slice(0, 80),
      }))
      .filter((row: { date: string; title: string }) => isIsoDate(row.date) && row.date >= todayIso && !!row.title)
      .slice(0, MAX_DINNER_PLAN)

    let running_low: GroceryPayload['insights']['running_low'] = []
    if (runningLowResult.status === 'fulfilled') {
      const { data, error } = runningLowResult.value
      if (error) {
        console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'grocery_running_low', error })
        console.error('Failed to load grocery_running_low insights', { device_id, error })
      } else {
        running_low = (data || [])
          .map((row: Record<string, unknown>) => {
            const name = firstString(row, ['name', 'item_name', 'display_name', 'canonical_name']).slice(0, 80)
            const label = firstString(row, ['label', 'display_label'], '').slice(0, 48)
            const status = firstString(row, ['status', 'item_status', 'memory_status'], 'learning').slice(0, 32)
            if (!name) return null
            return { name, label: label || groceryStatusLabel(status, language) }
          })
          .filter(Boolean)
          .slice(0, MAX_RUNNING_LOW) as GroceryPayload['insights']['running_low']
      }
    } else {
      console.error('Failed to load grocery_running_low insights', { device_id, error: runningLowResult.reason })
    }

    let recipes: GroceryPayload['insights']['recipes'] = []
    if (recipesResult.status === 'fulfilled') {
      const { data, error } = recipesResult.value
      if (error) {
        console.error('GROCERIES_DIAG_SUPABASE_ERROR', { device_id, query: 'grocery_recipe_suggestions', error })
        console.error('Failed to load grocery_recipe_suggestions insights', { device_id, error })
      } else {
        recipes = (data || [])
          .map((row: Record<string, unknown>) => {
            const name = firstString(row, ['name', 'recipe_name', 'title']).slice(0, 80)
            if (!name) return null
            const missing = asStringArray(row?.missing ?? row?.missing_ingredients ?? row?.missing_items)
              .slice(0, MAX_MISSING_PER_RECIPE)
              .map((x) => x.slice(0, 60))
            return { name, missing }
          })
          .filter(Boolean)
          .slice(0, MAX_RECIPES) as GroceryPayload['insights']['recipes']
      }
    } else {
      console.error('Failed to load grocery_recipe_suggestions insights', { device_id, error: recipesResult.reason })
    }

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
      insights: {
        running_low,
        recipes,
      },
      updated_at,
    }, device_id)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('GROCERIES_DIAG_ROUTE_ERROR', { error: e })
    return jsonErrorResponse({ error: message }, { status: 500 })
  }
}
