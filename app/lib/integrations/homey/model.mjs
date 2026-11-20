/** Read-only projection of Homey device values. Never copy entire device payloads. */
const measurements = Object.freeze({
  measure_temperature: { key: 'temperature', unit: '°C', min: -60, max: 100 },
  measure_humidity: { key: 'humidity', unit: '%', min: 0, max: 100 },
  measure_co2: { key: 'co2', unit: 'ppm', min: 0, max: 100000 },
  measure_power: { key: 'power', unit: 'W', min: -200000, max: 200000 },
  meter_power: { key: 'energy', unit: 'kWh', min: -1000000, max: 1000000000 },
})
const booleanCapabilities = Object.freeze({ onoff: 'on', alarm_contact: 'contact_alarm' })
export const HOMEY_SUPPORTED_CAPABILITIES = Object.freeze([
  ...Object.keys(measurements), ...Object.keys(booleanCapabilities),
])
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)

export function normalizeHomeyDevice(device, fallbackId = '') {
  if (!isRecord(device)) return null
  const id = typeof device.id === 'string' ? device.id : fallbackId
  if (!id || id.length > 128) return null
  const capabilities = isRecord(device.capabilitiesObj) ? device.capabilitiesObj : {}
  const values = {}
  for (const [capability, spec] of Object.entries(measurements)) {
    const entry = capabilities[capability]
    const value = isRecord(entry) ? entry.value : undefined
    if (typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max) {
      values[spec.key] = { value, unit: spec.unit }
    }
  }
  for (const [capability, key] of Object.entries(booleanCapabilities)) {
    const entry = capabilities[capability]
    const value = isRecord(entry) ? entry.value : undefined
    if (typeof value === 'boolean') values[key] = value
  }
  if (!Object.keys(values).length) return null
  const name = typeof device.name === 'string' ? device.name.trim().slice(0, 100) : ''
  const deviceClass = typeof device.class === 'string' ? device.class.trim().slice(0, 50) : ''
  return { id, name: name || 'Homey device', class: deviceClass, values }
}

/** Homey getDevices() returns an object map. Bound processing and discard unknown fields. */
export function normalizeHomeyDevices(payload) {
  if (!isRecord(payload) && !Array.isArray(payload)) return []
  const entries = Array.isArray(payload) ? payload.map((device, i) => [String(i), device]) : Object.entries(payload)
  return entries.slice(0, 250)
    .map(([id, device]) => normalizeHomeyDevice(device, id))
    .filter(Boolean)
}
