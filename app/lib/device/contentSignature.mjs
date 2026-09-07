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
const renderGeometry = (cell) => ({ ...dimensions(cell), size: String(cell?.size ?? 'ADAPTIVE').toUpperCase() })
const rotationStep = (now) => Math.floor(now / 14_400_000)
const nextRotation = (now) => (rotationStep(now) + 1) * 14_400_000
const firmwareRound = (value) => value < 0 ? -Math.round(-value) : Math.round(value)
const displayTemperature = (value, units) => {
  const n = finite(value)
  if (n == null) return null
  return firmwareRound(String(units).toLowerCase() === 'imperial' ? n * 9 / 5 + 32 : n)
}

function weatherProjection(value, cell, config) {
  const source = object(value), current = object(source.current), daily = object(source.daily)
  const { w, h } = dimensions(cell); const area = Number(cell?.colSpan ?? Math.max(1, Math.round(w / 200))) * Number(cell?.rowSpan ?? Math.max(1, Math.round(h / 120)))
  const currentTime = String(current.time ?? '')
  const currentHourIndex = (source.hourly?.time ?? []).findIndex((time) => String(time).slice(0, 13) === currentTime.slice(0, 13))
  const hourlyProbability = currentHourIndex >= 0 ? source.hourly?.precipitation_probability?.[currentHourIndex] : undefined
  const result = { current: {
    temperature_2m: displayTemperature(first(current.temperature_2m, source.temperature_2m, source.temperature), config.units),
    weather_code: first(current.weather_code, source.weather_code, source.wmo),
  } }
  if (area >= 2) result.condition = first(source.condition, source.weather_label)
  if (area >= 3) Object.assign(result.current, {
    wind_speed_10m: rounded(first(current.wind_speed_10m, source.wind_speed_10m)),
    wind_direction_10m: direction(first(current.wind_direction_10m, source.wind_direction_10m)),
  })
  if (area >= 3) {
    result.today = {
      temperature_2m_max: displayTemperature(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : source.temperature_2m_max, config.units),
      temperature_2m_min: displayTemperature(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : source.temperature_2m_min, config.units),
    }
  }
  if (area >= 4) result.current.precipitation_probability = rounded(first(hourlyProbability, current.precipitation_probability, source.precipitation_probability))
  if (area >= 4 && area < 8) result.insight = first(source.insight, source.nice_to_know)
  const forecastCount = area >= 8 && h >= 300 ? (w >= 500 ? 4 : 3) : 0
  if (forecastCount) result.forecast = Array.from({ length: forecastCount }, (_, offset) => {
    const i = offset + 1
    return { time: daily.time?.[i], temperature_2m_max: displayTemperature(daily.temperature_2m_max?.[i], config.units), weather_code: daily.weather_code?.[i] }
  })
  else if (area >= 8) result.insight = first(source.insight, source.nice_to_know)
  return result
}

function surfRow(row) {
  const source = object(row), inputs = object(first(source.inputs, source.picked?.inputs))
  const experience = object(first(source.breakdown?.experience, source.experience, source.picked?.breakdown?.experience, source.picked?.experience))
  return {
    label: first(source.label, source.day, source.dow, source.date),
    spot: first(source.spot, source.picked?.spot),
    wave: first(source.wave_height_range_label, source.waveRange, source.wave_range, source.forecast?.wave_height_range_label, rounded(first(inputs.swell_height_m, source.wave_height_m), 1)),
    period: rounded(first(inputs.swell_period_s, source.swell_period_s, source.period_s, source.period)),
    swellDirection: direction(first(inputs.swell_direction_deg, source.swell_direction_deg)),
    wind: rounded(first(inputs.wind_speed_ms, source.wind_speed_ms, source.wind_ms, source.wind)),
    windDirection: direction(first(inputs.wind_direction_deg, source.wind_direction_deg)),
    rating: rounded(first(source.finalRating, source.rating, source.score, source.stars,
      source.breakdown?.experience?.blended_rating_1_6, source.experience?.blended_rating_1_6,
      source.breakdown?.experience?.rating_1_6, source.experience?.rating_1_6)),
    experienceRating: experience.matched ? rounded(first(experience.blended_rating_1_6, experience.rating_1_6)) : null,
    line1: first(source.line1, source.summary),
  }
}
function surfProjection(value, cell) {
  const wrapper = object(value), source = object(wrapper.visible ?? wrapper), { w, h } = dimensions(cell)
  const needs = surfNeeds({ w, h }); const result = surfRow(source)
  if (needs.dayparts) result.dayparts = (source.dayparts ?? source.forecast?.dayparts ?? source.forecast?.parts ?? []).slice(0, w >= 500 ? 4 : 2).map(surfRow)
  if (needs.daily) result.daily = (source.daily ?? source.forecast?.daily ?? []).slice(0, 5).map(surfRow)
  return result
}

function stockValues(source, config) {
  const range = String(first(source.chartRange, config.chartRange, 'day')).toLowerCase()
  const rows = Array.isArray(source.selectedSeries) ? source.selectedSeries : (source.series?.[range] ?? source.series?.day ?? [])
  return rows.map((row) => finite(typeof row === 'number' ? row : first(row?.p, row?.price))).filter((n) => n != null)
}
function adaptiveStockPolicy(w, h, validSeries) {
  let family = 'chart_summary'
  if (w < 230 && h < 150) family = 'micro'
  else if (h < 160) family = 'summary_strip'
  else if (w < 260) family = 'summary_stack'
  else if (w >= 650 && h >= 300) family = 'detail_chart'
  else if (h >= 390 && w >= 360) family = 'expanded'
  let usefulWidth = false, usefulHeight = false, selectorWidth = false, selectorHeight = false
  if (family === 'detail_chart') { usefulWidth = w * 54 >= 20400; usefulHeight = h >= 150; selectorWidth = w * 54 >= 27400; selectorHeight = h >= 173 }
  else if (family === 'expanded') { usefulWidth = w >= 208; usefulHeight = h * 40 >= 12200; selectorWidth = w >= 278; selectorHeight = h * 40 >= 14500 }
  else if (family === 'chart_summary' && w > h) { usefulWidth = w * 55 >= 20200; usefulHeight = h >= 136; selectorWidth = w * 55 >= 27200; selectorHeight = h >= 159 }
  else if (family === 'chart_summary') { usefulWidth = w >= 208; usefulHeight = h * 42 >= 11000; selectorWidth = w >= 278; selectorHeight = h * 42 >= 13300 }
  const showChart = validSeries && usefulWidth && usefulHeight
  return { family, showChart, showSelector: showChart && selectorWidth && selectorHeight, showDetails: (family === 'detail_chart' || family === 'expanded') && h >= 300 }
}
function stockChartRect(cell, policy) {
  const { w, h } = dimensions(cell), pad = Math.max(9, Math.min(14, Math.trunc(w * 35 / 1000))), gap = 10
  if (String(cell?.size ?? 'ADAPTIVE').toUpperCase() !== 'ADAPTIVE') {
    // Legacy layouts always draw a chart except SMALL. The exact box only
    // matters to the pixel projection; use the renderer's medium dimensions.
    if (String(cell?.size).toUpperCase() === 'SMALL') return null
    if (String(cell?.size).toUpperCase() === 'MEDIUM') return { w: Math.max(20, w - 64), h: Math.max(20, h - 112) }
    return { w: Math.max(20, Math.trunc(w / 2) - 34), h: Math.max(20, h - 92) }
  }
  if (!policy.showChart) return null
  if (policy.family === 'detail_chart') return { w: w - Math.trunc(w * .42) - gap - pad, h: h - pad * 2 - 38 }
  if (policy.family === 'expanded') {
    const detailsY = pad + 108, detailsH = 78
    const cy = policy.showSelector ? detailsY + detailsH + 5 + 28 + 7 : detailsY + detailsH + 7
    return { w: w - pad * 2, h: h - pad - cy }
  }
  if (policy.family === 'chart_summary' && w > h) return { w: w - Math.trunc(w * .4) - gap - pad, h: h - pad * 2 - (policy.showSelector ? 32 : 0) }
  if (policy.family === 'chart_summary') return { w: w - pad * 2, h: h - pad - (pad + 108 + 8) - (policy.showSelector ? 31 : 0) }
  return null
}
function stockChartPixels(values, baseline, rect) {
  if (!rect || rect.w <= 6 || rect.h <= 6 || values.length < 2) return rect ? { state: 'no_chart_data' } : null
  let min = Math.min(...values), max = Math.max(...values)
  const reference = finite(baseline)
  if (reference != null && reference > 0) { min = Math.min(min, reference); max = Math.max(max, reference) }
  let span = max - min
  if (span < .0001) span = 1
  const y = (value) => rect.h - firmwareRound(((value - min) / span) * (rect.h - 1))
  const stroke = [y(values[0])]
  for (let dx = 1; dx < rect.w; dx++) {
    const index = dx / (rect.w - 1) * (values.length - 1), lo = Math.floor(index), hi = Math.min(values.length - 1, lo + 1)
    stroke.push(y(values[lo] + (values[hi] - values[lo]) * (index - lo)))
  }
  const referenceY = reference != null && reference > 0 && reference >= min && reference <= max && max - min >= .0001 ? y(reference) : null
  return { w: rect.w, h: rect.h, stroke, referenceY }
}
function stocksProjection(value, cell, config) {
  const source = object(value), quote = object(source.quote), { w, h } = dimensions(cell)
  const values = stockValues(source, config), policy = adaptiveStockPolicy(w, h, values.length >= 2 && values.every(Number.isFinite))
  const selectedRangePercent = values.length >= 2 && Math.abs(values[0]) > .00001 ? (values.at(-1) - values[0]) / values[0] * 100 : null
  const purchasePrice = finite(source.purchasePrice), personal = finite(source.personalChangePercent)
  const purchaseAware = purchasePrice != null && purchasePrice > 0 && personal != null
  const adaptive = String(cell?.size ?? 'ADAPTIVE').toUpperCase() === 'ADAPTIVE'
  const result = { symbol: source.symbol, name: source.name, currency: source.currency,
    price: renderedPrice(first(quote.price, quote.c)), changePercent: rounded(first(quote.changePercent, quote.dp), 2),
    rangePercent: policy.family === 'micro' ? undefined : rounded(selectedRangePercent, 2),
    thirdValue: adaptive ? undefined : purchaseAware ? { purchaseAware: true, personalChangePercent: rounded(personal, 2) } : { purchaseAware: false, rangePercent: rounded(selectedRangePercent, 2) },
  }
  const chartRect = stockChartRect(cell, policy)
  if (chartRect) { result.chartRange = first(source.chartRange, config.chartRange, 'day'); result.chart = stockChartPixels(values, source.baselinePrice, chartRect) }
  if (policy.showDetails) Object.assign(result, {
    open: renderedPrice(first(quote.open, quote.o)), high: renderedPrice(first(quote.high, quote.h)), low: renderedPrice(first(quote.low, quote.l)),
    previousClose: renderedPrice(first(quote.previousClose, quote.pc)), change: rounded(first(quote.change, quote.d), 2),
  })
  return result
}

function soccerProjection(value, cell) {
  const source = object(value), { w, h } = dimensions(cell)
  const next = source.next ? pick(source.next, ['isHome', 'homeShort', 'home', 'awayShort', 'away', 'utc']) : null
  const last = source.last ? pick(source.last, ['isHome', 'homeShort', 'home', 'awayShort', 'away', 'score']) : null
  const result = { teamName: source.teamName, competitionName: source.competitionName, next }
  if (!(w < 230 && h < 150)) result.standing = source.standing ? pick(source.standing, ['position', 'points']) : null
  if ((w < 260 && h >= 160) || (w >= 260 && h >= 250)) result.last = last
  const showTable = (w >= 560 && h >= 300) || (h >= 390 && w >= 360)
  if (showTable) result.table = (Array.isArray(source.table) ? source.table : []).slice(0, Math.max(3, Math.floor((Math.min(180, h * .38) - 30) / 22)))
    .map((row) => pick(row, ['position', 'teamShort', 'points', 'goalDifference', 'gap', 'isSelected']))
  if (h >= 420 && w >= 360) Object.assign(result, {
    standingDetails: source.standing ? pick(source.standing, ['playedGames', 'played', 'won', 'draw', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'form']) : null,
    topScorer: source.topScorer ? pick(source.topScorer, ['name', 'goals']) : null, lastScorers: source.lastScorers,
  })
  return result
}

function groceryProjection(value, cell, now) {
  const source = object(value), items = Array.isArray(source.items) ? source.items : [], { w, h } = dimensions(cell)
  const dinners = Array.isArray(source.dinner_plan) ? source.dinner_plan : [], insights = object(source.insights)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  const todayDinner = dinners.find((row) => row?.date === today), future = dinners.filter((row) => String(row?.date) > today)
  let family = 'list_columns'
  if (w < 230 && h < 150) family = 'micro'; else if (h < 165) family = 'item_strip'; else if (w < 270) family = 'list_stack'
  else if ((w >= 620 && h >= 300) || (w >= 360 && h >= 390)) family = 'expanded'; else if (w >= 480 && h >= 190) family = 'list_menu'
  const horizontal = family === 'item_strip', columns = family === 'list_columns' && w >= 360 ? 2 : 1
  const showMenu = (family === 'list_menu' || family === 'expanded') && w >= 500 && h >= 180 && future.length >= 2
  const showRunningLow = family === 'expanded' && h >= 300 && (insights.running_low?.length ?? 0) > 0
  const showMealIdeas = family === 'expanded' && h >= 390 && (insights.recipes?.length ?? 0) > 0
  const pad = Math.max(9, Math.min(14, Math.trunc(w * 35 / 1000))), gap = 12
  let topH = Math.max(1, h - pad * 2)
  if (showRunningLow || showMealIdeas) topH = Math.max(1, topH - Math.min(116, Math.trunc(h * 31 / 100)) - gap)
  const todayIsHeading = Boolean(todayDinner) && !showMenu
  const headerH = todayIsHeading && family !== 'item_strip' && family !== 'micro' ? 48 : 32
  const listH = Math.max(0, topH - headerH - 8), overflowH = 18, rowStep = 26
  const unreserved = horizontal ? Math.min(3, items.length) : Math.floor(listH / rowStep) * columns
  let capacity = items.length <= unreserved ? unreserved : horizontal ? Math.min(3, items.length) : Math.floor((listH - overflowH) / rowStep) * columns
  capacity = Math.min(12, Math.min(capacity, items.length))
  const rotation = items.length ? rotationStep(now) % items.length : 0
  const visible = Array.from({ length: capacity }, (_, i) => items[(rotation + i) % items.length]).map((item) => ({ name: first(item.name, item.label), quantity: first(item.quantity, item.qty, 1) }))
  const result = { ok: source.ok, language: source.language, heading: todayIsHeading ? todayDinner.title : undefined, items: visible, overflow: Math.max(0, items.length - capacity) }
  if (showMenu) result.menu = { heading: todayDinner?.title, rows: future.slice(0, Math.max(0, Math.floor((topH - 38) / 24))).map((row) => pick(row, ['date', 'title'])) }
  if (showRunningLow) result.running_low = insights.running_low.slice(0, 3).map((row) => pick(row, ['name', 'label']))
  if (showMealIdeas) result.recipes = insights.recipes.slice(0, 2).map((row) => ({ name: row?.name, missing: (row?.missing ?? []).slice(0, 2) }))
  return result
}

function assistantProjection(value, cell) {
  const source = object(value), { w, h } = dimensions(cell), total = Number(source.update_count ?? source.updates?.length ?? 0)
  const capacity = (h < 245 ? 1 : Math.min(6, Math.max(1, Math.floor((h - 70) / 65))))
  const updates = (Array.isArray(source.updates) ? source.updates : []).filter((row) => row?.topic && row?.summary).slice(0, capacity).map((row) => pick(row, ['topic', 'summary']))
  const secondary = h >= 155 || w >= 360
  return { ok: source.ok, language: source.language, active_watch_count: !total && secondary ? source.active_watch_count : undefined, mode: total ? 'updates' : 'quiet', updates, overflow: Math.max(0, total - capacity), secondary }
}

const reminderRow = (row, cell) => {
  const profile = Number(cell?.h) <= 120 || Number(cell?.w) < 250 ? 'compact' : Number(cell?.w) >= 600 && Number(cell?.h) >= 360 ? 'spacious' : 'standard'
  return {
    title: first(row?.profile_titles?.[profile], row?.title),
    occurrence_date: row?.occurrence_date,
    display_date: row?.display_date,
    days_until: Number(row?.days_until ?? 0), is_overdue: Boolean(row?.is_overdue),
    display_time: String(row?.display_time ?? '').slice(0, 5),
  }
}
function reminderProjection(value, cell, now) {
  const source = object(value), rows = (source.items ?? source.reminders ?? []).map((row) => reminderRow(row, cell))
  const buckets = []
  for (const row of rows) {
    let bucket = buckets.find((candidate) => candidate.daysUntil === row.days_until)
    if (!bucket) { bucket = { daysUntil: row.days_until, overdue: row.is_overdue || row.days_until < 0, rows: [] }; buckets.push(bucket) }
    bucket.rows.push(row)
  }
  const primary = buckets.find((bucket) => bucket.daysUntil === 0) ?? buckets.find((bucket) => bucket.daysUntil === 1) ?? buckets[0]
  if (!primary) return { ok: source.ok, state: 'empty' }
  const adaptive = String(cell?.size ?? 'ADAPTIVE').toUpperCase() === 'ADAPTIVE'
  if (adaptive) {
    const today = buckets.find((bucket) => bucket.daysUntil === 0), tomorrow = buckets.find((bucket) => bucket.daysUntil === 1)
    if (today || tomorrow) {
      const { w, h } = dimensions(cell), pad = Math.max(9, Math.min(18, firmwareRound(Math.min(w, h) * .08)))
      const usableW = w - pad * 2, usableH = h - pad * 2, shallow = w / h > 1.12 && usableH < 126
      if (shallow) {
        const available = Math.max(0, Math.floor((usableW + 12) / 154)), selected = today ?? tomorrow
        const count = Math.min(selected.rows.length, available)
        return { ok: source.ok, adaptive: 'shallow', sections: [{ daysUntil: selected.daysUntil, visible: selected.rows.slice(0, count), overflow: selected.rows.length - count }] }
      }
      const split = w / h > 1.12 && usableW >= 464 && usableH >= 164
      const heading = usableH >= 104 ? 30 : 0, sectionCount = (today ? 1 : 0) + (tomorrow ? 1 : 0)
      // Split composition also evaluates measured title usefulness. Keeping the
      // densest physically fitting rows here is conservative: it cannot miss a
      // visible row, while the exact chosen text is still retained.
      let capacity = split ? Math.max(sectionCount, Math.floor((usableH - heading - 24) / 38) * sectionCount)
        : Math.max(1, Math.floor((usableH - sectionCount * heading - (sectionCount > 1 ? 10 : 0) - 30 + 4) / 42))
      const selected = { today: 0, tomorrow: 0 }
      while (capacity-- > 0) {
        if (today && selected.today < today.rows.length) selected.today++
        if (capacity-- > 0 && tomorrow && selected.tomorrow < tomorrow.rows.length) selected.tomorrow++
        if ((!today || selected.today === today.rows.length) && (!tomorrow || selected.tomorrow === tomorrow.rows.length)) break
      }
      return { ok: source.ok, adaptive: split ? 'split' : 'vertical', sections: [
        ...(today ? [{ daysUntil: 0, visible: today.rows.slice(0, selected.today), overflow: today.rows.length - selected.today }] : []),
        ...(tomorrow ? [{ daysUntil: 1, visible: tomorrow.rows.slice(0, selected.tomorrow), overflow: tomorrow.rows.length - selected.tomorrow }] : []),
      ] }
    }
  }
  let capacity
  if (adaptive) {
    const { w, h } = dimensions(cell), pad = Math.max(9, Math.min(18, firmwareRound(Math.min(w, h) * .08)))
    capacity = h <= 150 && w > h ? Math.max(1, Math.floor((w - pad * 2 + 12) / 154)) : Math.max(1, Math.floor((h - pad * 2 - Math.min(30, Math.max(20, (h - pad * 2) / 4)) + 4) / 42))
  } else capacity = String(cell?.size).toUpperCase() === 'SMALL' ? 3 : primary.daysUntil === 0 || primary.daysUntil === 1 ? 4 : 3
  capacity = Math.min(primary.rows.length, capacity)
  const start = adaptive ? 0 : rotationStep(now) % primary.rows.length
  const visible = Array.from({ length: capacity }, (_, i) => primary.rows[(start + i) % primary.rows.length])
  return { ok: source.ok, primary: { daysUntil: primary.daysUntil, overdue: primary.overdue, visible, overflow: primary.rows.length - capacity } }
}

const countdownTemplate = (days, now) => {
  const near = [0, 1, 9, 12, 11, 13, 10, 8], mid = [0, 1, 2, 3, 4, 5, 8, 10], far = [0, 1, 2, 3, 4, 5, 6]
  const choices = days <= 7 ? near : days <= 45 ? mid : far
  return choices[rotationStep(now) % choices.length]
}
function countdownProjection(value, cell, now) {
  const source = object(value), limit = dimensions(cell).h >= 390 ? 6 : 1
  const items = (source.items ?? []).slice(0, limit).map((row) => pick(row, ['title', 'name', 'target_date', 'date', 'display_date', 'days_left']))
  if (String(cell?.size).toUpperCase() === 'SMALL' && Number(items[0]?.days_left) > 0) items[0].template = countdownTemplate(Number(items[0].days_left), now)
  return { ok: source.ok, items }
}

function renderConfigProjection(base, cell, config) {
  const module = object(config?.module)
  let visibleModule = {}
  if (base === 'weather') {
    const { w, h } = dimensions(cell), area = Number(cell?.colSpan ?? Math.max(1, Math.round(w / 200))) * Number(cell?.rowSpan ?? Math.max(1, Math.round(h / 120)))
    const adaptive = String(cell?.size ?? 'ADAPTIVE').toUpperCase() === 'ADAPTIVE'
    visibleModule = { configured: Boolean(Number(module.lat) && Number(module.lon)), units: module.units ?? 'metric',
      showHiLo: !adaptive || area >= 3 ? module.showHiLo ?? module.hiLo ?? true : undefined,
      showCondition: adaptive && area >= 2 ? module.showCondition ?? true : undefined,
      label: area >= 3 || !adaptive ? module.label : undefined }
  } else if (base === 'surf') visibleModule = { spot: module.spot, todaysBest: todaysBest(module) }
  else if (base === 'stocks') visibleModule = pick(module, ['symbol', 'name', 'chartRange'])
  else if (base === 'soccer') visibleModule = pick(module, ['teamName', 'competitionName'])
  else if (base === 'date') visibleModule = pick(module, ['country', 'holidays'])
  return { language: config?.language, timeZone: config?.timeZone, theme: config?.theme, module: visibleModule }
}

export function physicalRenderProjection(moduleKey, visibleValue, cell = {}, renderConfig = {}, now = Date.now()) {
  const base = String(moduleKey).split(':')[0]
  let visible = canonicalVisible(visibleValue)
  if (base === 'weather') visible = weatherProjection(visible, cell, object(renderConfig?.module))
  else if (base === 'surf') visible = surfProjection(visible, cell)
  else if (base === 'stocks') visible = stocksProjection(visible, cell, object(renderConfig?.module))
  else if (base === 'soccer') visible = soccerProjection(visible, cell)
  else if (base === 'groceries') visible = groceryProjection(visible, cell, now)
  else if (base === 'assistant') visible = assistantProjection(visible, cell)
  else if (base === 'countdown') visible = countdownProjection(visible, cell, now)
  else if (base === 'reminders') visible = reminderProjection(visible, cell, now)
  return { module: base, geometry: renderGeometry(cell), config: canonicalVisible(renderConfigProjection(base, cell, renderConfig)), visible: roundRendered('', canonicalVisible(visible)) }
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
    if (ref.base === 'date') deadlines[ref.key] = [{ at: midnight, type: 'hard', reason: 'midnight' }]
    else if (ref.base === 'countdown') {
      const at = nextRotation(now)
      const rotates = JSON.stringify(countdownProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(countdownProjection(sources[ref.key], ref.cell, at))
      deadlines[ref.key] = [
        ...(rotates ? [{ at, type: 'hard', reason: 'countdown_template_rotation' }] : []),
        { at: midnight, type: 'hard', reason: 'midnight' },
      ]
    } else if (ref.base === 'reminders') {
      const at = nextRotation(now)
      const rotates = JSON.stringify(reminderProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(reminderProjection(sources[ref.key], ref.cell, at))
      deadlines[ref.key] = [
        ...reminderBoundaries(sources[ref.key], now).map((boundary) => ({ at: boundary, type: 'hard', reason: 'reminder_boundary' })),
        ...(rotates ? [{ at, type: 'hard', reason: 'reminder_rotation' }] : []),
        { at: midnight, type: 'hard', reason: 'midnight' },
      ]
    }
    else if (ref.base === 'groceries') {
      const at = nextRotation(now)
      const rotates = JSON.stringify(groceryProjection(sources[ref.key], ref.cell, now)) !== JSON.stringify(groceryProjection(sources[ref.key], ref.cell, at))
      deadlines[ref.key] = [
        ...(rotates ? [{ at, type: 'hard', reason: 'grocery_rotation' }] : []),
        { at: now + 30 * 60_000, type: 'soft', reason: 'source_freshness' },
      ]
    }
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
