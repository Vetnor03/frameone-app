// app/api/device/frame-config/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { spotIdFromLabel } from '@/app/lib/surf/spots'
import { createHash } from 'crypto'

export const runtime = 'nodejs'

// Keep payload tiny (ESP-friendly)
const MAX_UPCOMING_HOLIDAYS = 6

type HolidayItem = { date: string; name: string }

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

function isIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function compareIso(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function isFiniteNumber(v: any) {
  return typeof v === 'number' && Number.isFinite(v)
}

function asBool(v: any, def: boolean) {
  return typeof v === 'boolean' ? v : def
}

function asInt(v: any, def: number) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : def
}

function asString(v: any, def: string) {
  return typeof v === 'string' ? v : def
}

function normalizeGroceryCategory(value: any) {
  const raw = asString(value, 'other').trim()
  if (raw === 'paalegg') return 'cold_cuts'
  return raw
}

type StockChartRange = 'day' | 'week' | 'month' | 'year'

function normalizeStockChartRange(value: any): StockChartRange {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'week' || v === 'month' || v === 'year') return v
  return 'day'
}

function normalizeAssetType(value: any): 'stock' | 'etf' | 'fund' | 'unknown' {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'etf' || v === 'fund' || v === 'unknown') return v
  return 'stock'
}

function normalizeCurrency(value: any): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

function groceriesSignature(items: Array<{ id: string; name: string; quantity: number; category: string; updated_at: string | null }>) {
  const stable = items
    .map((x) => `${x.id}|${x.name}|${x.quantity ?? ''}|${x.category}|${x.updated_at ?? ''}`)
    .sort()
    .join('||')
  return createHash('sha256').update(stable).digest('hex').slice(0, 16)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data, error } = await supabase
      .from('device_settings')
      .select('settings_json, updated_at')
      .eq('device_id', device_id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const settings_json: any =
      data?.settings_json ?? {
        theme: 'dark',
        layout: 'default',
        cells: [
          { slot: 0, module: 'date' },
          { slot: 1, module: 'weather:1' },
          { slot: 2, module: 'surf:1' },
        ],
        modules: {},
      }

    if (!settings_json.modules || typeof settings_json.modules !== 'object') {
      settings_json.modules = {}
    }

    if (Array.isArray(settings_json.cells)) {
      for (const c of settings_json.cells) {
        if (!c || typeof c !== 'object') continue
        if (c.module === 'weather') c.module = 'weather:1'
        if (c.module === 'surf') c.module = 'surf:1'
      }
    }

    // -------------------------------
    // ✅ Weather sanitize (unchanged from your version)
    // -------------------------------
    let weatherList: any[] = Array.isArray(settings_json.modules.weather) ? settings_json.modules.weather : []

    if (!Array.isArray(weatherList) || weatherList.length === 0) {
      weatherList = [
        {
          id: 1,
          label: 'Oslo, NO',
          lat: 59.9139,
          lon: 10.7522,
          units: 'metric',
          refresh: 600000,
          hiLo: true,
          cond: true,
        },
      ]
    }

    const sanitizedWeather: any[] = []
    const seenWeatherIds = new Set<number>()

    for (const w of weatherList) {
      if (!w || typeof w !== 'object') continue
      const id = asInt(w.id, 0)
      if (id < 1 || id > 255) continue
      if (seenWeatherIds.has(id)) continue

      const lat = w.lat
      const lon = w.lon
      if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) continue
      if (lat === 0 || lon === 0) continue

      const unitsRaw = asString(w.units, 'metric').toLowerCase()
      const units = unitsRaw === 'imperial' ? 'imperial' : 'metric'

      const refreshSafe = 1800000

      sanitizedWeather.push({
        id,
        label: asString(w.label, '').slice(0, 40),
        lat,
        lon,
        units,
        refresh: refreshSafe,
        hiLo: asBool(w.hiLo, true),
        cond: asBool(w.cond, true),
      })

      seenWeatherIds.add(id)
      if (sanitizedWeather.length >= 4) break
    }

    if (sanitizedWeather.length === 0) {
      sanitizedWeather.push({
        id: 1,
        label: 'Oslo, NO',
        lat: 59.9139,
        lon: 10.7522,
        units: 'metric',
        refresh: 600000,
        hiLo: true,
        cond: true,
      })
    }

    settings_json.modules.weather = sanitizedWeather

    // -------------------------------
    // ✅ Surf sanitize + auto spotId fill (NEW)
    // -------------------------------
    let surfList: any[] = Array.isArray(settings_json.modules.surf) ? settings_json.modules.surf : []
    const sanitizedSurf: any[] = []
    const seenSurfIds = new Set<number>()

    for (const s of surfList) {
      if (!s || typeof s !== 'object') continue

      const id = asInt(s.id, 0)
      if (id < 1 || id > 255) continue
      if (seenSurfIds.has(id)) continue

      const spotId = asString(s.spotId, '').trim()
      const spot = asString(s.spot, '').trim()

      // if spotId missing but spot exists, derive it
      const derivedSpotId = !spotId && spot ? spotIdFromLabel(spot) : null
      const finalSpotId = (spotId || derivedSpotId || '').slice(0, 31)
      const finalSpot = spot.slice(0, 47)

      if (!finalSpotId && !finalSpot) continue

      sanitizedSurf.push({
        id,
        spotId: finalSpotId || undefined,
        spot: finalSpot || undefined,
        refresh: 1800000,
      })

      seenSurfIds.add(id)
      if (sanitizedSurf.length >= 4) break
    }

    // If none configured, leave empty (firmware will show "Set spot")
    settings_json.modules.surf = sanitizedSurf

    // -------------------------------
    // ✅ Stocks sanitize + chart range default/validation
    // -------------------------------
    let stocksList: any[] = Array.isArray(settings_json.modules.stocks) ? settings_json.modules.stocks : []
    const sanitizedStocks: any[] = []
    const seenStockIds = new Set<number>()

    for (const s of stocksList) {
      if (!s || typeof s !== 'object') continue
      const id = asInt(s.id, 0)
      if (id < 1 || id > 255) continue
      if (seenStockIds.has(id)) continue

      const symbol = asString(s.symbol, '').trim().slice(0, 24)
      const name = asString(s.name, '').trim().slice(0, 80)
      const chartRange = normalizeStockChartRange(s.chartRange)
      const assetType = normalizeAssetType(s.assetType)
      const purchasePriceRaw = Number(s.purchasePrice)
      const purchasePrice = Number.isFinite(purchasePriceRaw) && purchasePriceRaw > 0 ? purchasePriceRaw : null
      const currency = normalizeCurrency(s.currency) || 'USD'

      sanitizedStocks.push({
        id,
        ...(symbol ? { symbol } : {}),
        ...(name ? { name } : {}),
        assetType,
        ...(purchasePrice != null ? { purchasePrice } : {}),
        currency,
        refresh: 900000,
        chartRange,
      })

      seenStockIds.add(id)
      if (sanitizedStocks.length >= 4) break
    }

    settings_json.modules.stocks = sanitizedStocks

    // -------------------------------
    // ✅ Groceries payload for firmware
    // -------------------------------
    const { data: groceriesData, error: groceriesError } = await supabase
      .from('grocery_items')
      .select('id, name, quantity, category, is_checked, checked_at, updated_at')
      .eq('device_id', device_id)
      .order('updated_at', { ascending: false })

    if (groceriesError) {
      return NextResponse.json({ error: groceriesError.message }, { status: 500 })
    }

    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
    const activeGroceries = (groceriesData || [])
      .filter((x: any) => {
        if (!x?.is_checked) return true
        if (!x?.checked_at) return false
        return new Date(String(x.checked_at)).getTime() >= twentyFourHoursAgo
      })
      .filter((x: any) => !x?.is_checked)
      .slice(0, 120)
      .map((x: any) => ({
        id: String(x.id),
        name: asString(x.name, '').slice(0, 80),
        quantity: Math.max(1, Number(x.quantity ?? 1) || 1),
        category: normalizeGroceryCategory(x.category).slice(0, 24),
        checked: false,
        updated_at: x.updated_at ? String(x.updated_at) : null,
      }))

    settings_json.modules.groceries = activeGroceries
    settings_json.modules.groceries_signature = groceriesSignature(activeGroceries)

    // -------------------------------
    // ✅ Dinner plan payload for firmware ("Today's dinner" header)
    // -------------------------------
    const { data: dinnerPlanData, error: dinnerPlanError } = await supabase
      .from('dinner_plan_days')
      .select('date,title')
      .eq('device_id', device_id)
      .order('date', { ascending: true })

    if (dinnerPlanError) {
      return NextResponse.json({ error: dinnerPlanError.message }, { status: 500 })
    }

    settings_json.modules.dinner_planner = (dinnerPlanData || [])
      .map((row: any) => ({
        date: asString(row?.date, '').slice(0, 10),
        title: asString(row?.title, '').trim().slice(0, 80),
      }))
      .filter((row: { date: string; title: string }) => isIsoDate(row.date) && !!row.title)
      .slice(0, 14)

    // -------------------------------
    // ✅ Holidays injection (unchanged from your version)
    // -------------------------------
    const todayIso = isoDateOnly(new Date())

    const dateMod =
      settings_json.modules.date && typeof settings_json.modules.date === 'object' ? settings_json.modules.date : {}

    const country =
      typeof dateMod.country === 'string' && dateMod.country.trim() ? dateMod.country.trim().toUpperCase() : 'NO'

    const now = new Date()
    const year = now.getUTCFullYear()
    const yearsToFetch = [year, year + 1]

    let all: HolidayItem[] = []

    try {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
      for (const y of yearsToFetch) {
        const resp = await fetch(`${base}/functions/v1/holidays?country=${encodeURIComponent(country)}&year=${y}`, {
          cache: 'no-store',
        })

        if (!resp.ok) continue

        const body = (await resp.json()) as any
        const list = Array.isArray(body?.holidays) ? body.holidays : []

        for (const h of list) {
          if (!h) continue
          const date = String(h.date || '')
          const name = String(h.name || '')
          if (!isIsoDate(date) || !name) continue
          all.push({ date, name })
        }
      }

      const keySet = new Set<string>()
      all = all.filter((h) => {
        const k = `${h.date}|${h.name}`
        if (keySet.has(k)) return false
        keySet.add(k)
        return true
      })

      all.sort((a, b) => compareIso(a.date, b.date))
      const upcoming = all.filter((h) => h.date >= todayIso).slice(0, MAX_UPCOMING_HOLIDAYS)

      settings_json.modules.date = {
        ...dateMod,
        country,
        holidays: upcoming,
      }
    } catch {
      settings_json.modules.date = {
        ...dateMod,
        country,
        holidays: Array.isArray(dateMod.holidays) ? dateMod.holidays : [],
      }
    }
    // -------------------------------
// ✅ Surf settings (home + fuel penalty) (NEW)
// modules.surf_settings = { fuelPenalty?: boolean, homeLat?: number, homeLon?: number, homeLabel?: string }
// -------------------------------
const surfSettingsRaw =
  settings_json.modules.surf_settings && typeof settings_json.modules.surf_settings === 'object'
    ? settings_json.modules.surf_settings
    : {}

const homeLat = Number(surfSettingsRaw.homeLat)
const homeLon = Number(surfSettingsRaw.homeLon)
const hasHome = Number.isFinite(homeLat) && Number.isFinite(homeLon) && homeLat !== 0 && homeLon !== 0

settings_json.modules.surf_settings = {
  fuelPenalty: asBool(surfSettingsRaw.fuelPenalty, false),
  homeLat: hasHome ? homeLat : 0,
  homeLon: hasHome ? homeLon : 0,
  homeLabel: asString(surfSettingsRaw.homeLabel, '').slice(0, 48),
}

    return NextResponse.json({
      device_id,
      settings_json,
      updated_at: data?.updated_at ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
