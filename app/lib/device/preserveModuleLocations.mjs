// Preserve previously selected locations when an unrelated or partially hydrated
// settings editor submits an empty module snapshot. New valid selections win.
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

function hasWeatherLocation(value) {
  return Array.isArray(value) && value.some((item) =>
    item && typeof item === 'object' &&
    String(item.label ?? '').trim() &&
    Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))
  )
}

function hasSurfLocation(value) {
  return Array.isArray(value) && value.some((item) =>
    item && typeof item === 'object' &&
    (String(item.spotId ?? '').trim() || String(item.spot ?? '').trim() ||
      (Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))))
  )
}

function hasSurfForecastLocation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Boolean(String(value.spotId ?? '').trim() || String(value.spot ?? '').trim() ||
    (Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lon))))
}

export function preserveStoredModuleLocations(storedSettings, requestedSettings) {
  const oldModules = record(record(storedSettings).modules)
  const requested = record(requestedSettings)
  const nextModules = record(requested.modules)
  const checks = [
    ['weather', hasWeatherLocation],
    ['surf', hasSurfLocation],
    ['surf_forecast', hasSurfForecastLocation],
  ]
  let merged = nextModules
  const preserved = []
  for (const [key, isConfigured] of checks) {
    if (isConfigured(oldModules[key]) && !isConfigured(nextModules[key])) {
      if (merged === nextModules) merged = { ...nextModules }
      merged[key] = oldModules[key]
      preserved.push(key)
    }
  }
  return {
    settingsJson: preserved.length ? { ...requested, modules: merged } : requestedSettings,
    preserved,
  }
}
