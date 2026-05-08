import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ITEMS = 40
const MAX_DINNER_PLAN = 14

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

function jsonErrorResponse(payload: { error: string }, init: { status: number }) {
  const json = JSON.stringify(payload)
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

    // Keep the existing response shape, but do not include raw history/memory/purchase-derived data
    // in the firmware groceries payload. The app UI suggestions/insights use separate tables/views.
    const running_low: GroceryPayload['insights']['running_low'] = []
    const recipes: GroceryPayload['insights']['recipes'] = []

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
    return jsonErrorResponse({ error: message }, { status: 500 })
  }
}
