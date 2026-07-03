// app/api/device/frame-config/builder.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { spotIdFromLabel } from '@/app/lib/surf/spots'

// Keep payload tiny (ESP-friendly)
const MAX_UPCOMING_HOLIDAYS = 6

type HolidayItem = { date: string; name: string }
type UnknownRecord = Record<string, unknown>

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

function isIsoDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function compareIso(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function isFiniteNumber(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v)
}

function asBool(v: unknown, def: boolean) {
  return typeof v === 'boolean' ? v : def
}

function asInt(v: unknown, def: number) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : def
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}

function asString(v: unknown, def: string) {
  return typeof v === 'string' ? v : def
}


type StockChartRange = 'day' | 'week' | 'month' | 'year'

function normalizeStockChartRange(value: unknown): StockChartRange {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'week' || v === 'month' || v === 'year') return v
  return 'day'
}

function normalizeAssetType(value: unknown): 'stock' | 'etf' | 'fund' | 'unknown' {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'etf' || v === 'fund' || v === 'unknown') return v
  return 'stock'
}

function normalizeCurrency(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

type ActiveModules = {
  bases: Set<string>
  ids: Map<string, Set<number>>
}

function activeModulesFromCells(cells: unknown): ActiveModules {
  const active: ActiveModules = { bases: new Set<string>(), ids: new Map<string, Set<number>>() }

  if (!Array.isArray(cells)) return active

  for (const c of cells) {
    if (!c || typeof c !== 'object') continue
    const moduleName = asString(c.module, '').trim().toLowerCase()
    if (!moduleName) continue

    const [baseRaw, idRaw] = moduleName.split(':', 2)
    const base = baseRaw.trim()
    if (!base) continue

    active.bases.add(base)

    const id = idRaw == null || idRaw === '' ? 1 : asInt(idRaw, 0)
    if (id < 1 || id > 255) continue

    let idSet = active.ids.get(base)
    if (!idSet) {
      idSet = new Set<number>()
      active.ids.set(base, idSet)
    }
    idSet.add(id)
  }

  return active
}

function isActiveBase(active: ActiveModules, base: string) {
  return active.bases.has(base)
}

function isActiveInstance(active: ActiveModules, base: string, id: number) {
  return active.ids.get(base)?.has(id) ?? false
}

function cloneObject(v: unknown): UnknownRecord {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as UnknownRecord) } : {}
}

const REUSABLE_USER_MODULE_KEYS = ['reminders', 'countdown', 'groceries', 'surf'] as const

function mergeReusableUserModules(current: UnknownRecord, reusable: UnknownRecord): UnknownRecord {
  const next: UnknownRecord = { ...current }

  for (const key of REUSABLE_USER_MODULE_KEYS) {
    if (next[key] == null && reusable[key] != null) next[key] = reusable[key]
  }

  if (next.surf_settings == null && reusable.surf_settings != null) {
    next.surf_settings = reusable.surf_settings
  }
  if (next.surf_forecast == null && reusable.surf_forecast != null) {
    next.surf_forecast = reusable.surf_forecast
  }

  return next
}

async function loadReusableUserModules(supabase: SupabaseClient, device_id: string): Promise<UnknownRecord> {
  const { data: targetMembers, error: targetMembersError } = await supabase
    .from('device_members')
    .select('user_id')
    .eq('device_id', device_id)

  if (targetMembersError) throw new Error(targetMembersError.message)

  const userIds = Array.from(
    new Set(
      (targetMembers ?? [])
        .map((row: { user_id?: unknown }) => asString(row.user_id, '').trim())
        .filter(Boolean)
    )
  )

  if (userIds.length === 0) return {}

  const { data: sharedMembers, error: sharedMembersError } = await supabase
    .from('device_members')
    .select('device_id')
    .in('user_id', userIds)
    .neq('device_id', device_id)

  if (sharedMembersError) throw new Error(sharedMembersError.message)

  const sourceDeviceIds = Array.from(
    new Set(
      (sharedMembers ?? [])
        .map((row: { device_id?: unknown }) => asString(row.device_id, '').trim())
        .filter(Boolean)
    )
  )

  if (sourceDeviceIds.length === 0) return {}

  const { data: settingsRows, error: settingsError } = await supabase
    .from('device_settings')
    .select('settings_json, updated_at')
    .in('device_id', sourceDeviceIds)
    .order('updated_at', { ascending: false })

  if (settingsError) throw new Error(settingsError.message)

  const reusable: UnknownRecord = {}
  for (const row of settingsRows ?? []) {
    const settings = cloneObject((row as { settings_json?: unknown }).settings_json)
    const modules = cloneObject(settings.modules)

    for (const key of REUSABLE_USER_MODULE_KEYS) {
      if (reusable[key] == null && modules[key] != null) reusable[key] = modules[key]
    }

    if (reusable.surf_settings == null && modules.surf_settings != null) {
      reusable.surf_settings = modules.surf_settings
    }
    if (reusable.surf_forecast == null && modules.surf_forecast != null) {
      reusable.surf_forecast = modules.surf_forecast
    }
  }

  return reusable
}




export type FrameConfigPayload = {
  device_id: string
  settings_json: UnknownRecord
  updated_at: unknown
}

export async function buildFrameConfigPayload(supabase: SupabaseClient, device_id: string): Promise<FrameConfigPayload> {
    const { data, error } = await supabase
      .from('device_settings')
      .select('settings_json, updated_at')
      .eq('device_id', device_id)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    const settings_json: UnknownRecord =
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

    const ownModules: UnknownRecord =
      settings_json.modules && typeof settings_json.modules === 'object' && !Array.isArray(settings_json.modules)
        ? (settings_json.modules as UnknownRecord)
        : {}

    // Read cells first and keep them unchanged for firmware layout parsing.
    const cells = Array.isArray(settings_json.cells) ? settings_json.cells : []
    const active = activeModulesFromCells(cells)
    const reusableModules = await loadReusableUserModules(supabase, device_id)
    const sourceModules = mergeReusableUserModules(ownModules, reusableModules)
    const responseModules: UnknownRecord = {}

    // -------------------------------
    // Weather config: include only active weather instance ids.
    // -------------------------------
    if (isActiveBase(active, 'weather')) {
      let weatherList: UnknownRecord[] = Array.isArray(sourceModules.weather) ? sourceModules.weather : []

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

      const sanitizedWeather: UnknownRecord[] = []
      const seenWeatherIds = new Set<number>()

      for (const w of weatherList) {
        if (!w || typeof w !== 'object') continue
        const id = asInt(w.id, 0)
        if (id < 1 || id > 255) continue
        if (!isActiveInstance(active, 'weather', id)) continue
        if (seenWeatherIds.has(id)) continue

        const lat = w.lat
        const lon = w.lon
        if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) continue
        if (lat === 0 || lon === 0) continue

        const unitsRaw = asString(w.units, 'metric').toLowerCase()
        const units = unitsRaw === 'imperial' ? 'imperial' : 'metric'

        sanitizedWeather.push({
          id,
          label: asString(w.label, '').slice(0, 40),
          lat,
          lon,
          units,
          refresh: 1800000,
          hiLo: asBool(w.hiLo, true),
          cond: asBool(w.cond, true),
        })

        seenWeatherIds.add(id)
        if (sanitizedWeather.length >= 4) break
      }

      if (sanitizedWeather.length === 0 && isActiveInstance(active, 'weather', 1)) {
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

      responseModules.weather = sanitizedWeather
    }

    // -------------------------------
    // Surf config: include only active surf instances; no forecast arrays.
    // -------------------------------
    if (isActiveBase(active, 'surf')) {
      const surfList: UnknownRecord[] = Array.isArray(sourceModules.surf) ? sourceModules.surf : []
      const sanitizedSurf: UnknownRecord[] = []
      const seenSurfIds = new Set<number>()

      for (const s of surfList) {
        if (!s || typeof s !== 'object') continue

        const id = asInt(s.id, 0)
        if (id < 1 || id > 255) continue
        if (!isActiveInstance(active, 'surf', id)) continue
        if (seenSurfIds.has(id)) continue

        const spotId = asString(s.spotId, '').trim()
        const spot = asString(s.spot, '').trim()
        const derivedSpotId = !spotId && spot ? spotIdFromLabel(spot) : null
        // Keep room for custom spot ids (uuid is 36 chars; prefixed ids are longer).
        const finalSpotId = (spotId || derivedSpotId || '').slice(0, 80)
        const finalSpot = spot.slice(0, 47)
        const lat = asNumber(s.lat)
        const lon = asNumber(s.lon)

        if (!finalSpotId && !finalSpot && lat == null && lon == null) continue

        sanitizedSurf.push({
          id,
          spotId: finalSpotId || undefined,
          spot: finalSpot || undefined,
          lat: lat ?? undefined,
          lon: lon ?? undefined,
          refresh: 1800000,
        })

        seenSurfIds.add(id)
        if (sanitizedSurf.length >= 4) break
      }

      responseModules.surf = sanitizedSurf

      const surfSettingsRaw = cloneObject(sourceModules.surf_settings)
      const homeLat = Number(surfSettingsRaw.homeLat)
      const homeLon = Number(surfSettingsRaw.homeLon)
      const hasHome = Number.isFinite(homeLat) && Number.isFinite(homeLon) && homeLat !== 0 && homeLon !== 0

      responseModules.surf_settings = {
        fuelPenalty: asBool(surfSettingsRaw.fuelPenalty, false),
        homeLat: hasHome ? homeLat : 0,
        homeLon: hasHome ? homeLon : 0,
        homeLabel: asString(surfSettingsRaw.homeLabel, '').slice(0, 48),
      }
    }

    // -------------------------------
    // Soccer config: include only active team instances; no match lists.
    // -------------------------------
    if (isActiveBase(active, 'soccer')) {
      const soccerList: UnknownRecord[] = Array.isArray(sourceModules.soccer) ? sourceModules.soccer : []
      const sanitizedSoccer: UnknownRecord[] = []
      const seenSoccerIds = new Set<number>()

      for (const s of soccerList) {
        if (!s || typeof s !== 'object') continue

        const id = asInt(s.id, 0)
        if (id < 1 || id > 255) continue
        if (!isActiveInstance(active, 'soccer', id)) continue
        if (seenSoccerIds.has(id)) continue

        const teamId = asString(s.teamId, '').trim().slice(0, 31)
        const teamName = asString(s.teamName, '').trim().slice(0, 47)
        const competitionId = asString(s.competitionId, '').trim().slice(0, 15)
        const competitionName = asString(s.competitionName, '').trim().slice(0, 47)

        if (!teamId && !teamName) continue

        sanitizedSoccer.push({
          id,
          ...(teamId ? { teamId } : {}),
          ...(teamName ? { teamName } : {}),
          ...(competitionId ? { competitionId } : {}),
          ...(competitionName ? { competitionName } : {}),
          refresh: 1800000,
        })

        seenSoccerIds.add(id)
        if (sanitizedSoccer.length >= 4) break
      }

      responseModules.soccer = sanitizedSoccer
    }

    // -------------------------------
    // Stocks config: include only active stock instances; no quotes/charts.
    // -------------------------------
    if (isActiveBase(active, 'stocks')) {
      const stocksList: UnknownRecord[] = Array.isArray(sourceModules.stocks) ? sourceModules.stocks : []
      const sanitizedStocks: UnknownRecord[] = []
      const seenStockIds = new Set<number>()

      for (const s of stocksList) {
        if (!s || typeof s !== 'object') continue
        const id = asInt(s.id, 0)
        if (id < 1 || id > 255) continue
        if (!isActiveInstance(active, 'stocks', id)) continue
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

      responseModules.stocks = sanitizedStocks
    }

    // -------------------------------
    // Date config: include holiday data only when date is active.
    // -------------------------------
    if (isActiveBase(active, 'date')) {
      const todayIso = isoDateOnly(new Date())
      const dateMod = cloneObject(sourceModules.date)
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

          const body = (await resp.json()) as UnknownRecord
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

        responseModules.date = {
          ...dateMod,
          country,
          holidays: upcoming,
        }
      } catch {
        responseModules.date = {
          ...dateMod,
          country,
          holidays: Array.isArray(dateMod.holidays) ? dateMod.holidays : [],
        }
      }
    }

    // Keep any lightweight active module configs whose shape firmware already ignores/owns.
    // Do not include groceries item/history/memory data in frame-config.
    if (isActiveBase(active, 'reminders') && sourceModules.reminders != null) {
      responseModules.reminders = cloneObject(sourceModules.reminders)
    }
    if (isActiveBase(active, 'countdown') && sourceModules.countdown != null) {
      responseModules.countdown = cloneObject(sourceModules.countdown)
    }
    if (isActiveBase(active, 'groceries') && sourceModules.groceries != null) {
      const groceries = cloneObject(sourceModules.groceries)
      delete groceries.items
      delete groceries.history
      delete groceries.memory
      delete groceries.suggestions
      responseModules.groceries = groceries
    }

    const responseSettingsJson = {
      ...settings_json,
      cells,
      modules: responseModules,
    }

    const payload = {
      device_id,
      settings_json: responseSettingsJson,
      updated_at: data?.updated_at ?? null,
    }

    return payload
}
