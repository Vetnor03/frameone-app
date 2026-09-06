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

const roundRendered = (key, value) => {
  if (typeof value === 'number' && /(^|_)(temp|temperature|high|low|degrees?)$/i.test(key)) return Math.round(value)
  if (Array.isArray(value)) return value.map((child) => roundRendered(key, child))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, roundRendered(childKey, child)]))
}

// This projection is shared by the physical render-state endpoint. Inputs have
// already been limited to the exact active module and stripped of sync metadata;
// numeric weather values are quantized exactly as the e-paper labels are.
export function physicalRenderDigest(moduleKey, visibleValue, cell = {}) {
  let projected = visibleValue
  if (moduleKey === 'reminders') {
    const key = Array.isArray(visibleValue?.items) ? 'items' : Array.isArray(visibleValue?.reminders) ? 'reminders' : null
    if (key) {
      const area = Number(cell.w ?? 0) * Number(cell.h ?? 0)
      const capacity = area >= 300_000 ? 10 : area >= 150_000 ? 6 : area >= 80_000 ? 4 : 2
      projected = { ...visibleValue, [key]: visibleValue[key].slice(0, capacity) }
    }
  }
  return contentDigest({ module: moduleKey, visible: roundRendered('', canonicalVisible(projected)) })
}

function nextMidnight(now, timeZone = 'Europe/Oslo') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(now)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const offset = localAsUtc - now
  return Date.UTC(parts.year, parts.month - 1, parts.day + 1) - offset
}

function reminderBoundaries(source, now) {
  const rows = Array.isArray(source?.reminders) ? source.reminders : Array.isArray(source?.items) ? source.items : []
  const result = []
  for (const row of rows) {
    for (const [dateKey, timeKey] of [['occurrence_date', 'due_time'], ['due_date', 'due_time'], ['end_date', 'end_time']]) {
      const date = String(row?.[dateKey] ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const time = /^\d{2}:\d{2}/.test(String(row?.[timeKey] ?? '')) ? String(row[timeKey]).slice(0, 5) : '00:00'
      const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number)
      const guess = Date.UTC(year, month - 1, day, hour, minute)
      const oslo = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit',
      }).formatToParts(new Date(guess)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
      const offset = Date.UTC(oslo.year, oslo.month - 1, oslo.day, oslo.hour, oslo.minute) - guess
      const at = guess - offset
      if (Number.isFinite(at) && at > now) result.push(at)
    }
  }
  return [...new Set(result)].sort((a, b) => a - b)
}

export function physicalModuleDeadlines({ settings, sources, now = Date.now() }) {
  const refs = activePhysicalReferences(settings)
  const midnight = nextMidnight(now)
  const deadlines = {}
  for (const ref of refs.values()) {
    if (ref.base === 'date' || ref.base === 'countdown') deadlines[ref.key] = [{ at: midnight, type: 'hard', reason: 'midnight' }]
    else if (ref.base === 'reminders') deadlines[ref.key] = [
      ...reminderBoundaries(sources[ref.key], now).map((at) => ({ at, type: 'hard', reason: 'reminder_boundary' })),
      { at: midnight, type: 'hard', reason: 'midnight' },
    ]
    else {
      const configured = ref.id == null ? null : configuredInstance(settings?.modules, ref.base, ref.id)
      const interval = Math.max(5 * 60_000, Number(configured?.refresh) || (ref.base === 'weather' ? 10 * 60_000 : 30 * 60_000))
      deadlines[ref.key] = [{ at: now + interval, type: 'soft', reason: 'source_freshness' }]
    }
  }
  return deadlines
}

export function physicalRenderManifest({ settings, sources, now = Date.now() }) {
  const refs = activePhysicalReferences(settings)
  const deadlines = physicalModuleDeadlines({ settings, sources, now })
  return [...refs.values()].map((ref) => ({
    key: ref.key,
    render_hash: physicalRenderDigest(ref.key, sources[ref.key] ?? null, ref.cell),
    bounds: { x: Number(ref.cell.col ?? 0) * 200, y: Number(ref.cell.row ?? 0) * 120, w: Number(ref.cell.w ?? 800), h: Number(ref.cell.h ?? 480) },
    partial_safe: true,
    deadlines: deadlines[ref.key] ?? [],
  }))
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
