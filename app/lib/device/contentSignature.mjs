import { createHash } from 'node:crypto'

const INSTANCE_BASES = new Set(['weather', 'surf', 'soccer', 'stocks'])
export const VOLATILE_CONTENT_KEYS = new Set([
  'updated_at', 'requested_at', 'fetched_at', 'fetch_timestamp', 'fetchedAt', 'request_id', 'requestId',
  'debug_id', 'debugId', 'trace_id', 'last_probe_at', 'http_timing', 'http', 'fetch', 'metadata', 'meta',
  'debug', 'diagnostics', 'sourceDiagnostics', 'cache', 'cache_age', 'cacheAge', 'cache_ttl', 'cacheTtl',
  'cache_hit', 'cacheHit', 'stale_at', 'staleAt', 'expires_at', 'expiresAt', 'signature', 'asOf',
])

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
  if (typeof value === 'number' && /(^|_)(temp(?:erature)?(?:_2m)?(?:_(?:max|min))?|high|low|degrees?)$/i.test(key)) return Math.round(value)
  if (Array.isArray(value)) return value.map((child) => roundRendered(key, child))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, roundRendered(childKey, child)]))
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null
const rounded = (value, digits = 0) => {
  const n = finite(value)
  return n == null ? null : Number(n.toFixed(digits))
}
const renderedPrice = (value) => {
  const n = finite(value)
  return n == null ? null : rounded(n, Math.abs(n) >= 1000 ? 0 : 2)
}
const first = (...values) => values.find((value) => value !== undefined && value !== null)
const pick = (source, keys) => Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]))
const direction = (value) => {
  const n = finite(value)
  return n == null ? null : ((Math.round(n / 45) % 8) + 8) % 8
}
const dimensions = (cell) => ({ w: Number(cell?.w ?? Number(cell?.colSpan ?? 0) * 200), h: Number(cell?.h ?? Number(cell?.rowSpan ?? 0) * 120) })

function weatherProjection(value, cell) {
  const source = object(value), current = object(source.current), daily = object(source.daily)
  const { w, h } = dimensions(cell); const area = Number(cell?.colSpan ?? Math.max(1, Math.round(w / 200))) * Number(cell?.rowSpan ?? Math.max(1, Math.round(h / 120)))
  const result = { current: {
    temperature_2m: rounded(first(current.temperature_2m, source.temperature_2m, source.temperature)),
    weather_code: first(current.weather_code, source.weather_code, source.wmo),
  } }
  if (area >= 2) result.condition = first(source.condition, source.weather_label)
  if (area >= 3) Object.assign(result.current, {
    wind_speed_10m: rounded(first(current.wind_speed_10m, source.wind_speed_10m)),
    wind_direction_10m: direction(first(current.wind_direction_10m, source.wind_direction_10m)),
  })
  if (area >= 3) {
    result.today = {
      temperature_2m_max: rounded(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : source.temperature_2m_max),
      temperature_2m_min: rounded(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : source.temperature_2m_min),
    }
  }
  if (area >= 4) result.current.precipitation_probability = rounded(first(current.precipitation_probability, source.precipitation_probability))
  if (area >= 4 && area < 8) result.insight = first(source.insight, source.nice_to_know)
  const forecastCount = area >= 8 && h >= 300 ? (w >= 500 ? 4 : 3) : 0
  if (forecastCount) result.forecast = Array.from({ length: forecastCount }, (_, offset) => {
    const i = offset + 1
    return { time: daily.time?.[i], temperature_2m_max: rounded(daily.temperature_2m_max?.[i]), weather_code: daily.weather_code?.[i] }
  })
  else if (area >= 8) result.insight = first(source.insight, source.nice_to_know)
  return result
}

function surfRow(row) {
  const source = object(row), inputs = object(first(source.inputs, source.picked?.inputs))
  const experience = object(first(source.breakdown?.experience, source.experience, source.picked?.breakdown?.experience, source.picked?.experience))
  return {
    label: first(source.label, source.day, source.dow, source.date),
    spot: first(source.spot, source.picked?.spot), spotId: first(source.spotId, source.picked?.spotId),
    wave: first(source.wave_height_range_label, source.waveRange, source.wave_range, source.forecast?.wave_height_range_label, rounded(first(inputs.swell_height_m, source.wave_height_m), 1)),
    period: rounded(first(inputs.swell_period_s, source.swell_period_s, source.period_s, source.period)),
    swellDirection: direction(first(inputs.swell_direction_deg, source.swell_direction_deg)),
    wind: rounded(first(inputs.wind_speed_ms, source.wind_speed_ms, source.wind_ms, source.wind)),
    windDirection: direction(first(inputs.wind_direction_deg, source.wind_direction_deg)),
    rating: rounded(first(source.finalRating, source.rating, source.score, source.stars,
      source.breakdown?.experience?.blended_rating_1_6, source.experience?.blended_rating_1_6,
      source.breakdown?.experience?.rating_1_6, source.experience?.rating_1_6)),
    experienceRating: experience.matched ? rounded(first(experience.blended_rating_1_6, experience.rating_1_6)) : null,
    line1: first(source.line1, source.summary), line2: first(source.line2, source.detail),
  }
}
function surfProjection(value, cell) {
  const wrapper = object(value), source = object(wrapper.visible ?? wrapper), { w, h } = dimensions(cell)
  const needs = surfNeeds({ w, h }); const result = surfRow(source)
  result.selected_spot_id = first(wrapper.selected_spot_id, source.spotId, source.picked?.spotId)
  if (needs.dayparts) result.dayparts = (source.dayparts ?? source.forecast?.dayparts ?? source.forecast?.parts ?? []).slice(0, w >= 500 ? 4 : 2).map(surfRow)
  if (needs.daily) result.daily = (source.daily ?? source.forecast?.daily ?? []).slice(0, 5).map(surfRow)
  return result
}

function stockSeries(source, config, pixels) {
  const range = String(first(source.chartRange, config.chartRange, 'day')).toLowerCase()
  const rows = Array.isArray(source.selectedSeries) ? source.selectedSeries : (source.series?.[range] ?? source.series?.day ?? [])
  const numbers = rows.map((row) => finite(typeof row === 'number' ? row : first(row?.p, row?.price))).filter((n) => n != null)
  if (numbers.length < 2) return numbers
  const min = Math.min(...numbers), max = Math.max(...numbers), span = max - min
  return numbers.map((n) => span === 0 ? 0 : Math.round((n - min) * Math.max(1, pixels - 1) / span))
}
function stocksProjection(value, cell, config) {
  const source = object(value), quote = object(source.quote), { w, h } = dimensions(cell)
  const result = { symbol: source.symbol, name: source.name, currency: source.currency,
    price: renderedPrice(first(quote.price, quote.c)), changePercent: rounded(first(quote.changePercent, quote.dp), 2) }
  const showChart = !((w < 230 && h < 150) || h < 160 || w < 260)
  if (showChart) { result.chartRange = first(source.chartRange, config.chartRange, 'day'); result.chart = stockSeries(source, config, Math.min(220, Math.max(40, h - 80))) }
  if ((w >= 650 && h >= 300) || (h >= 390 && w >= 360)) Object.assign(result, {
    open: renderedPrice(first(quote.open, quote.o)), high: renderedPrice(first(quote.high, quote.h)), low: renderedPrice(first(quote.low, quote.l)),
    previousClose: renderedPrice(first(quote.previousClose, quote.pc)), change: rounded(first(quote.change, quote.d), 2),
    personalChangePercent: rounded(source.personalChangePercent, 2),
  })
  return result
}

function soccerProjection(value, cell) {
  const source = object(value), { w, h } = dimensions(cell)
  const result = { teamName: source.teamName, competitionName: source.competitionName, next: source.next ?? null }
  if (!(w < 230 && h < 150)) result.standing = source.standing ?? null
  if ((w < 260 && h >= 160) || (w >= 260 && h >= 250)) result.last = source.last ?? null
  const showTable = (w >= 560 && h >= 300) || (h >= 390 && w >= 360)
  if (showTable) result.table = (Array.isArray(source.table) ? source.table : []).slice(0, Math.max(3, Math.floor((Math.min(180, h * .38) - 30) / 22)))
  if (h >= 420 && w >= 360) Object.assign(result, { topScorer: source.topScorer, lastScorers: source.lastScorers })
  return result
}

function groceryProjection(value, cell, now) {
  const source = object(value), items = Array.isArray(source.items) ? source.items : [], { w, h } = dimensions(cell)
  const horizontal = h < 165, pad = Math.max(9, Math.min(14, w * .035)), headerH = 32
  const capacity = Math.min(12, horizontal ? 3 : Math.max(0, Math.floor((h - pad * 2 - headerH - 8 - 18) / 26)) * (w >= 360 ? 2 : 1), items.length)
  const rotation = items.length ? Math.floor(now / 14_400_000) % items.length : 0
  const visible = Array.from({ length: capacity }, (_, i) => items[(rotation + i) % items.length]).map((item) => ({ name: first(item.name, item.label), quantity: first(item.quantity, item.qty, 1) }))
  const result = { ok: source.ok, language: source.language, items: visible, overflow: Math.max(0, items.length - capacity) }
  if ((w >= 480 && h >= 190)) result.dinner_plan = source.dinner_plan
  if ((w >= 620 && h >= 300) || (w >= 360 && h >= 390)) result.insights = source.insights
  return result
}

function assistantProjection(value, cell) {
  const source = object(value), { w, h } = dimensions(cell), total = Number(source.update_count ?? source.updates?.length ?? 0)
  const capacity = (h < 245 ? 1 : Math.min(6, Math.max(1, Math.floor((h - 70) / 65))))
  const updates = (Array.isArray(source.updates) ? source.updates : []).filter((row) => row?.topic && row?.summary).slice(0, capacity).map((row) => pick(row, ['topic', 'summary']))
  const secondary = h >= 155 || w >= 360
  return { ok: source.ok, language: source.language, active_watch_count: !total && secondary ? source.active_watch_count : undefined, mode: total ? 'updates' : 'quiet', updates, overflow: Math.max(0, total - capacity), secondary }
}

function renderConfigProjection(config) {
  const module = object(config?.module)
  const ignored = new Set(['refresh', 'refreshMs', 'updated_at', 'created_at', 'lat', 'lon', 'teamId', 'competitionId', 'purchasePrice'])
  return { language: config?.language, timeZone: config?.timeZone, theme: config?.theme, module: Object.fromEntries(Object.entries(module).filter(([key]) => !ignored.has(key))) }
}

export function physicalRenderProjection(moduleKey, visibleValue, cell = {}, renderConfig = {}, now = Date.now()) {
  const base = String(moduleKey).split(':')[0]
  let visible = canonicalVisible(visibleValue)
  if (base === 'weather') visible = weatherProjection(visible, cell)
  else if (base === 'surf') visible = surfProjection(visible, cell)
  else if (base === 'stocks') visible = stocksProjection(visible, cell, object(renderConfig?.module))
  else if (base === 'soccer') visible = soccerProjection(visible, cell)
  else if (base === 'groceries') visible = groceryProjection(visible, cell, now)
  else if (base === 'assistant') visible = assistantProjection(visible, cell)
  else if (base === 'countdown') visible = { items: (visible?.items ?? []).slice(0, dimensions(cell).h >= 390 ? 6 : 1)
    .map((row) => pick(row, ['title', 'name', 'target_date', 'date', 'display_date', 'days_left'])) }
  else if (base === 'reminders') {
    const key = Array.isArray(visible?.items) ? 'items' : Array.isArray(visible?.reminders) ? 'reminders' : null
    if (key) {
      const { w, h } = dimensions(cell); const area = w * h
      const capacity = area >= 300_000 ? 10 : area >= 150_000 ? 6 : area >= 80_000 ? 4 : 2
      visible = { [key]: visible[key].slice(0, capacity).map((row) => pick(row,
        ['title', 'occurrence_date', 'display_date', 'days_until', 'is_overdue', 'display_time', 'profile_titles'])) }
    }
  }
  return { module: base, geometry: dimensions(cell), config: canonicalVisible(renderConfigProjection(renderConfig)), visible: roundRendered('', canonicalVisible(visible)) }
}

// This projection is shared by the physical render-state endpoint. Inputs have
// already been limited to the exact active module and stripped of sync metadata;
// numeric weather values are quantized exactly as the e-paper labels are.
export function physicalRenderDigest(moduleKey, visibleValue, cell = {}, renderConfig = {}, now = Date.now()) {
  return contentDigest(physicalRenderProjection(moduleKey, visibleValue, cell, renderConfig, now))
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
    for (const [dateKey, timeKeys] of [['occurrence_date', ['display_time', 'due_time']], ['due_date', ['due_time']], ['end_date', ['end_time']]]) {
      const date = String(row?.[dateKey] ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const actualTime = timeKeys.map((key) => String(row?.[key] ?? '')).find((value) => /^\d{2}:\d{2}/.test(value))
      const time = actualTime ? actualTime.slice(0, 5) : '00:00'
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
    else if (ref.base === 'groceries' && (sources[ref.key]?.items?.length ?? 0) > 1) deadlines[ref.key] = [
      { at: (Math.floor(now / 14_400_000) + 1) * 14_400_000, type: 'hard', reason: 'grocery_rotation' },
      { at: now + 30 * 60_000, type: 'soft', reason: 'source_freshness' },
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
    render_hash: physicalRenderDigest(ref.key, sources[ref.key] ?? null, ref.cell, {
      language: settings?.language ?? settings?.locale ?? 'en',
      timeZone: settings?.timeZone ?? settings?.timezone ?? 'Europe/Oslo',
      theme: settings?.theme ?? 'default',
      module: ref.id == null
        ? canonicalVisible(object(settings?.modules)[ref.base] ?? {})
        : canonicalVisible(configuredInstance(settings?.modules, ref.base, ref.id) ?? {}),
    }, now),
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
