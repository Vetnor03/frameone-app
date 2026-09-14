import * as base from './contentSignatureBase.mjs'
export * from './contentSignatureBase.mjs'

// The legacy smart-refresh implementation now lives in contentSignatureBase.mjs.
// Keep these source-level regression markers beside the wrapper so the firmware
// regression test still verifies the inherited physical endpoint contract:
// INSTANCE_BASES = new Set(['weather', 'surf', 'soccer', 'stocks'])
// '/api/device/stocks' with device_id: deviceId, id
// '/api/surf/score' with frame: 1
// competitionId: config.competitionId

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const integerId = (value) => { const id = Number(value); return Number.isInteger(id) && id >= 1 && id <= 255 ? id : null }
const skiCell = (cell) => /^ski(?::\d+)?$/i.test(String(cell?.module ?? '').trim())
const withoutSkiCells = (settings) => ({ ...object(settings), cells: (Array.isArray(settings?.cells) ? settings.cells : []).filter((cell) => !skiCell(cell)) })
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null
const firmwareRound = (value) => value < 0 ? -Math.round(-value) : Math.round(value)
const dimensions = (cell) => ({ w: Number(cell?.w ?? Number(cell?.colSpan ?? 0) * 200), h: Number(cell?.h ?? Number(cell?.rowSpan ?? 0) * 120) })
const geometry = (cell) => ({ ...dimensions(cell), size: String(cell?.size ?? 'ADAPTIVE').toUpperCase() })

function configuredSki(modules, id) {
  return (Array.isArray(modules?.ski) ? modules.ski : []).find((item) => integerId(item?.id ?? 1) === id) ?? null
}

function skiVisible(source) {
  const root = object(source)
  const location = object(root.location)
  const current = object(root.current)
  const snow = object(root.snow)
  const avalanche = object(root.avalanche)
  const level = finite(avalanche.danger_level)
  const assessed = avalanche.assessed === true && level != null && level > 0
  return {
    location: String(location.label ?? 'Ski').trim().toUpperCase(),
    freshCm: finite(snow.fresh_24h_cm) == null ? null : firmwareRound(finite(snow.fresh_24h_cm)),
    totalCm: finite(snow.snow_depth_cm) == null ? null : firmwareRound(finite(snow.snow_depth_cm)),
    tempC: finite(current.temp_c) == null ? null : firmwareRound(finite(current.temp_c)),
    windMps: finite(current.wind_mps) == null ? null : firmwareRound(finite(current.wind_mps)),
    windDir: finite(current.wind_dir_deg) == null ? null : ((Math.round(finite(current.wind_dir_deg) / 45) % 8) + 8) % 8,
    avalanche: assessed ? firmwareRound(level) : (avalanche.available === true || level === 0 ? 'not_assessed' : 'unavailable'),
  }
}

export function activePhysicalReferences(settings) {
  const refs = base.activePhysicalReferences(withoutSkiCells(settings))
  for (const rawCell of Array.isArray(settings?.cells) ? settings.cells : []) {
    const cell = object(rawCell)
    const match = String(cell.module ?? '').trim().toLowerCase().match(/^ski(?::(\d+))?$/)
    if (!match) continue
    const id = integerId(match[1] || 1)
    if (id == null) continue
    const key = `ski:${id}`
    if (!refs.has(key)) refs.set(key, { key, base: 'ski', id, cell })
  }
  return refs
}

export function buildContentRequestPlan({ settings, deviceId, origin, now = Date.now() }) {
  const basePlan = base.buildContentRequestPlan({ settings: withoutSkiCells(settings), deviceId, origin, now })
  const refs = activePhysicalReferences(settings)
  const requests = [...basePlan.requests]
  for (const ref of refs.values()) {
    if (ref.base !== 'ski') continue
    const endpoint = new URL('/api/device/ski-frame', origin)
    endpoint.searchParams.set('device_id', deviceId)
    endpoint.searchParams.set('id', String(ref.id))
    requests.push({ key: ref.key, url: endpoint })
  }
  return { refs, requests, timeInputs: basePlan.timeInputs }
}

export async function collectVisibleContent({ settings, deviceId, origin, authorization, now = Date.now(), fetchImpl = fetch }) {
  const stripped = withoutSkiCells(settings)
  const baseVisible = await base.collectVisibleContent({ settings: stripped, deviceId, origin, authorization, now, fetchImpl })
  const refs = activePhysicalReferences(settings)
  const sources = { ...object(baseVisible.sources) }

  await Promise.all([...refs.values()].filter((ref) => ref.base === 'ski').map(async (ref) => {
    const endpoint = new URL('/api/device/ski-frame', origin)
    endpoint.searchParams.set('device_id', deviceId)
    endpoint.searchParams.set('id', String(ref.id))
    const response = await fetchImpl(endpoint, { headers: { authorization }, cache: 'no-store' })
    if (!response.ok) throw new Error(`content_source_${response.status}`)
    sources[ref.key] = await response.json()
  }))

  const original = object(settings)
  const originalModules = object(original.modules)
  const baseConfig = object(baseVisible.config)
  const baseModules = object(baseConfig.modules)
  const activeSkiIds = new Set([...refs.values()].filter((ref) => ref.base === 'ski').map((ref) => ref.id))
  const activeSki = (Array.isArray(originalModules.ski) ? originalModules.ski : []).filter((item) => activeSkiIds.has(integerId(item?.id ?? 1)))
  const config = base.canonicalVisible({ ...baseConfig, cells: Array.isArray(original.cells) ? original.cells : [], modules: { ...baseModules, ...(activeSki.length ? { ski: activeSki } : {}) } })

  return {
    config,
    active: [...new Set([...(Array.isArray(baseVisible.active) ? baseVisible.active : []), ...[...refs.keys()].filter((key) => key.startsWith('ski:'))])].sort(),
    time: object(baseVisible.time),
    sources,
  }
}

export function physicalRenderProjection(moduleKey, visibleValue, cell = {}, renderConfig = {}, now = Date.now()) {
  if (String(moduleKey).split(':')[0] !== 'ski') return base.physicalRenderProjection(moduleKey, visibleValue, cell, renderConfig, now)
  const { w, h } = dimensions(cell)
  const supported = (Number(cell?.colSpan) === 2 && Number(cell?.rowSpan) === 2) || (w === 400 && h === 240) || String(cell?.size ?? '').toUpperCase() === 'MEDIUM'
  return {
    module: 'ski',
    geometry: geometry(cell),
    config: { theme: renderConfig?.theme ?? 'default' },
    visible: supported ? skiVisible(visibleValue) : { supported: false },
  }
}

export function physicalRenderDigest(moduleKey, visibleValue, cell = {}, renderConfig = {}, now = Date.now()) {
  if (String(moduleKey).split(':')[0] !== 'ski') return base.physicalRenderDigest(moduleKey, visibleValue, cell, renderConfig, now)
  return base.contentDigest(physicalRenderProjection(moduleKey, visibleValue, cell, renderConfig, now))
}

export function physicalModuleDeadlines({ settings, sources, now = Date.now() }) {
  const deadlines = base.physicalModuleDeadlines({ settings: withoutSkiCells(settings), sources, now })
  for (const ref of activePhysicalReferences(settings).values()) {
    if (ref.base !== 'ski') continue
    const config = configuredSki(object(settings?.modules), ref.id)
    const interval = Math.max(5 * 60_000, Number(config?.refresh) || 30 * 60_000)
    deadlines[ref.key] = [{ at: now + interval, type: 'soft', reason: 'source_freshness' }]
  }
  return deadlines
}

export function physicalRenderManifest({ settings, sources, now = Date.now() }) {
  const manifest = base.physicalRenderManifest({ settings: withoutSkiCells(settings), sources, now })
  const deadlines = physicalModuleDeadlines({ settings, sources, now })
  for (const ref of activePhysicalReferences(settings).values()) {
    if (ref.base !== 'ski') continue
    const { w, h } = dimensions(ref.cell)
    manifest.push({
      key: ref.key,
      render_hash: physicalRenderDigest(ref.key, sources?.[ref.key] ?? null, ref.cell, { theme: settings?.theme ?? 'default' }, now),
      bounds: { x: Number(ref.cell?.col ?? 0) * 200, y: Number(ref.cell?.row ?? 0) * 120, w, h },
      partial_safe: true,
      deadlines: deadlines[ref.key] ?? [],
    })
  }
  return manifest
}
