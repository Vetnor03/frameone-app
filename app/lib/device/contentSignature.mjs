import { createHash } from 'node:crypto'

const INSTANCE_BASES = new Set(['weather', 'surf', 'soccer', 'stocks'])
export const VOLATILE_CONTENT_KEYS = new Set(['updated_at', 'requested_at', 'fetched_at', 'fetch_timestamp', 'request_id', 'last_probe_at', 'http_timing'])

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const integerId = (value) => { const id = Number(value); return Number.isInteger(id) && id >= 1 && id <= 255 ? id : null }
export function canonicalVisible(value) {
  if (Array.isArray(value)) return value.map(canonicalVisible)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_CONTENT_KEYS.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, canonicalVisible(child)]))
}
export function contentDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalVisible(value))).digest('hex')
}

function physicalGeometry(cell) {
  const colSpan = Number(cell?.colSpan), rowSpan = Number(cell?.rowSpan)
  const geometry = `${colSpan}x${rowSpan}`
  const sizes = { '4x1': 'SMALL', '2x2': 'MEDIUM', '4x2': 'LARGE', '4x4': 'XL' }
  return { ...cell, size: sizes[geometry] ?? 'ADAPTIVE', w: colSpan * 200, h: rowSpan * 120 }
}
export function withPhysicalCellGeometry(settings, layouts) {
  const layout = String(settings?.layout ?? 'default')
  const geometry = layout === 'custom' ? [] : (Array.isArray(layouts?.[layout]) ? layouts[layout] : [])
  const bySlot = new Map(geometry.map((cell) => [Number(cell.slot), cell]))
  return { ...settings, cells: (Array.isArray(settings?.cells) ? settings.cells : []).map((raw) => {
    const cell = object(raw)
    const shape = layout === 'custom' ? cell : bySlot.get(Number(cell.slot))
    return shape ? physicalGeometry({ ...cell, ...shape, module: cell.module }) : cell
  }) }
}

export function activePhysicalReferences(settings) {
  const refs = new Map()
  for (const rawCell of Array.isArray(settings?.cells) ? settings.cells : []) {
    const cell = object(rawCell)
    const [rawBase, rawId] = String(cell.module ?? '').trim().toLowerCase().split(':', 2)
    if (!rawBase) continue
    const id = INSTANCE_BASES.has(rawBase) ? (rawId ? integerId(rawId) : 1) : null
    if (INSTANCE_BASES.has(rawBase) && id == null) continue
    const key = id == null ? rawBase : `${rawBase}:${id}`
    if (!refs.has(key)) refs.set(key, { key, base: rawBase, id, cell })
  }
  return refs
}

function configuredInstance(modules, base, id) {
  return (Array.isArray(modules?.[base]) ? modules[base] : []).find((item) => integerId(item?.id) === id) ?? null
}
function url(origin, path, params) {
  const result = new URL(path, origin)
  for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) result.searchParams.set(key, String(value))
  return result
}
function surfNeeds(cell) {
  const width = Number(cell.w ?? 0), height = Number(cell.h ?? 0)
  const daily = width >= 500 && height >= 390 && width * height >= 210000
  return { daily, dayparts: daily || (width >= 330 && height >= 210) || (width >= 250 && height >= 300) }
}
function todaysBest(config) {
  const id = String(config.spotId ?? '').toLowerCase()
  const label = String(config.spot ?? '').trim().toLowerCase()
  return id === '__todays_best__' || label === "today's best" || label === 'todays best' || label === 'dagens beste'
}
function surfUrl(origin, config, settings, needs, spotIdOverride) {
  const params = { hours: 4, frame: 1 }
  if (spotIdOverride) params.spotId = spotIdOverride
  else if (config.spotId) params.spotId = config.spotId
  else params.spot = config.spot || 'Surf'
  if (Number(config.lat) && Number(config.lon)) { params.lat = config.lat; params.lon = config.lon }
  if (needs.dayparts) params.dayparts = 1
  if (needs.daily) { params.daily = 1; params.days = 5 }
  if (!spotIdOverride && todaysBest(config)) {
    const surfSettings = object(settings?.modules?.surf_settings)
    params.fuelPenalty = surfSettings.fuelPenalty ? 1 : 0
    if (surfSettings.fuelPenalty && Number(surfSettings.homeLat) && Number(surfSettings.homeLon)) {
      params.homeLat = surfSettings.homeLat; params.homeLon = surfSettings.homeLon
    }
  }
  return url(origin, '/api/surf/score', params)
}

export function buildContentRequestPlan({ settings, deviceId, origin, now = Date.now() }) {
  const refs = activePhysicalReferences(settings)
  const modules = object(settings?.modules)
  const requests = []
  const timeInputs = {}
  const osloDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  if (refs.has('date')) timeInputs.date = osloDate

  for (const ref of refs.values()) {
    const id = ref.id
    if (ref.base === 'reminders') requests.push({ key: ref.key, url: url(origin, '/api/device/reminders', { device_id: deviceId, limit: 10, tz: 'Europe/Oslo', skip_sync: 0 }) })
    else if (ref.base === 'countdown') requests.push({ key: ref.key, url: url(origin, '/api/device/countdowns', { device_id: deviceId }) })
    else if (ref.base === 'groceries') requests.push({ key: ref.key, url: url(origin, '/api/device/groceries', { device_id: deviceId }) })
    else if (ref.base === 'assistant') requests.push({ key: ref.key, url: url(origin, '/api/device/assistant', { device_id: deviceId }) })
    else if (ref.base === 'stocks') requests.push({ key: ref.key, url: url(origin, '/api/device/stocks', { device_id: deviceId, id }) })
    else if (ref.base === 'weather') {
      const config = configuredInstance(modules, 'weather', id)
      if (config) requests.push({ key: ref.key, url: url(origin, '/api/weather/details', { frame: 1, compact: 2, days: 5, lat: config.lat ?? 59.9139, lon: config.lon ?? 10.7522 }) })
    } else if (ref.base === 'soccer') {
      const config = configuredInstance(modules, 'soccer', id)
      if (config) requests.push({ key: ref.key, url: url(origin, '/api/soccer/frame', { teamId: config.teamId ?? '', competitionId: config.competitionId ?? '' }) })
    } else if (ref.base === 'surf') {
      const config = configuredInstance(modules, 'surf', id)
      if (config) { const needs = surfNeeds(ref.cell); const best = todaysBest(config); requests.push({ key: ref.key, url: surfUrl(origin, config, settings, best && (needs.dayparts || needs.daily) ? { dayparts: false, daily: false } : needs), surf: { config, needs, todaysBest: best, settings, origin } }) }
    }
  }
  return { refs, requests, timeInputs }
}

async function responseJson(fetchImpl, request, authorization) {
  const response = await fetchImpl(request.url, { headers: { authorization }, cache: 'no-store' })
  if (!response.ok) throw new Error(`content_source_${response.status}`)
  return canonicalVisible(await response.json())
}
export async function collectVisibleContent({ settings, deviceId, origin, authorization, now, fetchImpl = fetch }) {
  const plan = buildContentRequestPlan({ settings, deviceId, origin, now })
  const sources = {}
  // Each module is an independent pipeline. Surf winner detail remains ordered
  // inside its own pipeline, while it no longer delays unrelated modules.
  await Promise.all(plan.requests.map(async (request) => {
    const first = await responseJson(fetchImpl, request, authorization)
    if (request.surf?.todaysBest && (request.surf.needs.dayparts || request.surf.needs.daily)) {
      const winnerId = first?.spotId ?? first?.picked?.spotId
      if (winnerId) {
        const winnerRequest = { url: surfUrl(request.surf.origin, request.surf.config, request.surf.settings, request.surf.needs, winnerId) }
        sources[request.key] = { selected_spot_id: winnerId, visible: await responseJson(fetchImpl, winnerRequest, authorization) }
        return
      }
    }
    sources[request.key] = first
  }))
  const groceryItems = Array.isArray(sources.groceries?.items) ? sources.groceries.items : []
  if (groceryItems.length >= 2) plan.timeInputs.groceries_rotation = Math.floor((now ?? Date.now()) / (4 * 60 * 60 * 1000))
  const activeBases = new Set([...plan.refs.values()].map((ref) => ref.base))
  const effectiveModules = {}
  for (const [base, value] of Object.entries(object(settings?.modules))) {
    if (base === 'surf_settings') {
      if (activeBases.has('surf')) effectiveModules[base] = value
      continue
    }
    if (!activeBases.has(base)) continue
    effectiveModules[base] = INSTANCE_BASES.has(base) && Array.isArray(value)
      ? value.filter((item) => plan.refs.has(`${base}:${integerId(item?.id)}`))
      : value
  }
  const activeConfig = canonicalVisible({ ...settings, modules: effectiveModules })
  return { config: activeConfig, active: [...plan.refs.keys()].sort(), time: plan.timeInputs, sources }
}
