// Persistent, account/device-scoped *display snapshots* for the app's module tabs.
// Never pass full frame settings, auth tokens, or integration credentials here.
// Cached data is only rendered after Supabase verifies the current account and
// frame membership; mutations remain locked until a fresh read succeeds.
export const TAB_SNAPSHOT_PREFIX = 'remind:tab-snapshot:v1:'
export const TAB_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_BYTES = 95000
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value)
const text = (value, limit = 256) => typeof value === 'string' ? value.slice(0, limit) : ''
const optionalText = (value, limit = 256) => value == null ? null : text(value, limit)
const quantity = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const rows = (value, max) => Array.isArray(value) ? value.slice(0, max) : []
const httpsUrl = value => typeof value === 'string' && /^https:\/\//i.test(value) ? value.slice(0, 500) : null
const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const SOURCE_KEYS = new Set(['remind','teams','google-calendar','spond','local-events','waste','bonnetid'])

function sanitizeReminders(data) {
  if (!isPlain(data)) return null
  return {
    items: rows(data.items, 250).filter(item => isPlain(item) && item.id && item.title && item.date && item.source !== 'aladhan').map(item => ({
      id: text(item.id, 128),
      title: text(item.title, 350),
      date: text(item.date, 40),
      time: optionalText(item.time, 40),
      endDate: optionalText(item.endDate, 40),
      endTime: optionalText(item.endTime, 40),
      tag: optionalText(item.tag, 24),
      repeat: text(item.repeat || 'none', 24),
      customRepeatDays: item.customRepeatDays == null ? null : quantity(item.customRepeatDays),
      repeatWeekdays: rows(item.repeatWeekdays, 7).map(v => quantity(v)).filter(v => Number.isInteger(v) && v >= 0 && v <= 7),
      source: SOURCE_KEYS.has(item.source) ? item.source : 'remind',
      editable: item.editable === true,
      starterKey: optionalText(item.starterKey, 128),
      sourceUrl: httpsUrl(item.sourceUrl),
      sourceEventGroupKey: optionalText(item.sourceEventGroupKey, 180),
      eventGroupKey: optionalText(item.eventGroupKey, 180),
      externalEventId: optionalText(item.externalEventId, 180),
      venue: optionalText(item.venue, 200),
      eventSource: optionalText(item.eventSource, 80),
      skippedOnFrame: item.skippedOnFrame === true,
      alternativeCount: quantity(item.alternativeCount),
      ticketLinks: rows(item.ticketLinks, 5).map(link => ({ source:text(link?.source,60),url:httpsUrl(link?.url) })).filter(link => link.source && link.url),
    })),
    completedOccurrences: rows(data.completedOccurrences, 250).map(value => ({
      reminderId: text(value?.reminderId, 128), occurrenceDate: text(value?.occurrenceDate, 16),
    })).filter(value => value.reminderId && value.occurrenceDate),
    availableSources: rows(data.availableSources, 8).filter(value => SOURCE_KEYS.has(value)),
  }
}

function sanitizeGroceries(data) {
  if (!isPlain(data)) return null
  const item = value => ({
    id: text(value?.id, 128),
    name: text(value?.name, 200),
    quantity: Math.max(1, quantity(value?.quantity, 1)),
    amount: value?.amount == null ? null : quantity(value.amount),
    unit: optionalText(value?.unit, 60),
    category: text(value?.category || 'other', 40),
    isChecked: value?.isChecked === true,
    checkedAt: optionalText(value?.checkedAt, 40),
    updatedAt: optionalText(value?.updatedAt, 40),
  })
  if (data.kind === 'dinner') {
    return {
      kind: 'dinner',
      days: rows(data.days, 7).map(day => ({
        day: text(day?.day, 12),
        title: text(day?.title, 240),
        items: rows(day?.items, 35).map(entry => ({
          name: text(entry?.name, 200),
          category: text(entry?.category || 'other', 40),
          quantity: Math.max(1, quantity(entry?.quantity, 1)),
          isChecked: entry?.isChecked === true,
          checkedAt: optionalText(entry?.checkedAt, 40),
          updatedAt: optionalText(entry?.updatedAt, 40),
        })).filter(entry => entry.name),
      })).filter(day => ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(day.day)),
    }
  }
  return {kind: 'list',items: rows(data.items, 300).map(item).filter(value => value.id && value.name)}
}

function sanitizeCountdown(data) {
  if (!isPlain(data)) return null
  return {
    items: rows(data.items, 160).map(item => ({
      id: text(item?.id, 128),
      title: text(item?.title, 250),
      date: text(item?.date, 40),
      pinned: item?.pinned === true,
    })).filter(item => item.id && item.title && /^\d{4}-\d{2}-\d{2}$/.test(item.date)),
  }
}

function sanitizeNews(data) {
  if (!isPlain(data)) return null
  return {
    items: rows(data.items, 30).map(item => ({
      id: text(item?.id, 128),
      title: text(item?.title, 350),
      url: httpsUrl(item?.url),
      published_at: optionalText(item?.published_at, 40),
    })).filter(item => item.id && item.title),
    stale: data.stale === true,
  }
}

// Ski is public weather/avalanche forecast data. Keep only the fields needed
// by the summary view, not the original request/configuration.
const SKI_FIELDS = {
  current: ['temp_c','wind_mps','wind_dir_deg','gust_mps','precipitation_1h_mm'],
  snow: ['snow_depth_cm','fresh_24h_cm','fresh_72h_cm','altitude_m','source_date'],
  avalanche: ['available','assessed','danger_level','danger_name','region_name','valid_from','main_text','full_warning_url','attribution'],
  resort: ['available','id','name','distance_km','ski_open','lift_only','resort_open','today_hours','lifts_open','lifts_total','slopes_open','slopes_total','url','last_updated'],
  next_powder_day: ['found','date','estimated_fresh_cm_low','estimated_fresh_cm_high','estimated_fresh_cm_mid','precipitation_mm','mean_snow_temp_c','peak_wind_mps','basis','elevation_m','confidence'],
}
function sanitizeSki(data) {
  if (!isPlain(data) || !isPlain(data.summary)) return null
  const summary = { generated_at: optionalText(data.summary.generated_at, 50) }
  for (const [section, fields] of Object.entries(SKI_FIELDS)) {
    const source = data.summary[section]
    if (!isPlain(source)) continue
    summary[section] = Object.fromEntries(fields
      .filter(key => Object.prototype.hasOwnProperty.call(source,key))
      .map(key => [key, key === 'today_hours' && isPlain(source[key])
        ? Object.fromEntries(['closed','from','to'].map(k => [k, source[key][k] == null ? null : typeof source[key][k] === 'string' ? text(source[key][k], 30) : source[key][k] === true]))
        : (key === 'url' || key === 'full_warning_url') ? httpsUrl(source[key]) :
          typeof source[key] === 'string' ? text(source[key], 160) :
          typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] :
          typeof source[key] === 'boolean' ? source[key] : null]))
  }
  if (isPlain(data.summary.location)) {
    summary.location = {
      label: text(data.summary.location.label, 80),
      lat: quantity(data.summary.location.lat),
      lon: quantity(data.summary.location.lon),
    }
  }
  if (isPlain(data.summary.snow) && isPlain(data.summary.snow.grid)) {
    summary.snow = {...summary.snow, grid: {
      x: quantity(data.summary.snow.grid.x), y: quantity(data.summary.snow.grid.y),
    }}
  }
  if (isPlain(data.summary.avalanche)) {
    summary.avalanche = {...summary.avalanche, problems: rows(data.summary.avalanche.problems, 8).map(problem => ({
      name: optionalText(problem?.name, 120),
      aspects: rows(problem?.aspects, 20).map(value => text(value,30)),
      elevation: optionalText(problem?.elevation,80),
      trigger: optionalText(problem?.trigger,100),
      size: optionalText(problem?.size,60),
    }))}
  }
  summary.forecast = rows(data.summary.forecast, 16).map(day => ({
    date: text(day?.date,20),
    min_temp_c: day?.min_temp_c == null ? null : quantity(day.min_temp_c),
    max_temp_c: day?.max_temp_c == null ? null : quantity(day.max_temp_c),
    precipitation_mm: day?.precipitation_mm == null ? null : quantity(day.precipitation_mm),
    symbol_code: optionalText(day?.symbol_code,100),
    wind_mps: day?.wind_mps == null ? null : quantity(day.wind_mps),
    wind_dir_deg: day?.wind_dir_deg == null ? null : quantity(day.wind_dir_deg),
  })).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
  return {summary}
}

function sanitize(tab, data) {
  if (tab === 'reminders') return sanitizeReminders(data)
  if (tab === 'groceries') return sanitizeGroceries(data)
  if (tab === 'countdown') return sanitizeCountdown(data)
  if (tab === 'news') return sanitizeNews(data)
  if (tab === 'ski') return sanitizeSki(data)
  return null
}

export function tabSnapshotKey(userId, deviceId, tab, variant = '') {
  if (!validId(userId) || !validId(deviceId)) return null
  if (!['reminders','groceries','countdown','news','ski'].includes(tab)) return null
  if (typeof variant !== 'string' || !/^[a-zA-Z0-9_-]{0,36}$/.test(variant)) return null
  return TAB_SNAPSHOT_PREFIX + userId + ':' + deviceId + ':' + tab + ':' + variant
}

export function readTabSnapshot(storage, userId, deviceId, tab, variant = '', now = Date.now()) {
  const key = tabSnapshotKey(userId, deviceId, tab, variant)
  if (!key || !storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw || raw.length > MAX_BYTES) return null
    const snapshot = JSON.parse(raw)
    if (snapshot?.version !== 1 || snapshot.userId !== userId || snapshot.deviceId !== deviceId
      || snapshot.tab !== tab || snapshot.variant !== variant || !Number.isFinite(snapshot.savedAt)
      || snapshot.savedAt > now + 60000 || now - snapshot.savedAt > TAB_SNAPSHOT_MAX_AGE_MS) return null
    const data = sanitize(tab, snapshot.data)
    return data ? {data, savedAt:snapshot.savedAt} : null
  } catch { return null }
}

export function writeTabSnapshot(storage, userId, deviceId, tab, variant = '', data, now = Date.now()) {
  const key = tabSnapshotKey(userId, deviceId, tab, variant)
  if (!key || !storage) return false
  try {
    const safe = sanitize(tab, data)
    if (!safe) return false
    const raw = JSON.stringify({version:1,userId,deviceId,tab,variant,savedAt:now,data:safe})
    if (raw.length > MAX_BYTES) return false
    storage.setItem(key, raw)
    return true
  } catch { return false }
}

export function clearTabSnapshotsForUser(storage, userId) {
  if (!validId(userId) || !storage) return
  try {
    const prefix = TAB_SNAPSHOT_PREFIX + userId + ':'
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) storage.removeItem(key)
    }
  } catch { /* localStorage unavailable */ }
}
