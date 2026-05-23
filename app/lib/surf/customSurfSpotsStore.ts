export type DirectionSectorConfig = {
  startDeg: number
  endDeg: number
  bestDeg: number
}

export type CustomSurfSpot = {
  spotId: string
  label: string
  kind: 'custom'
  breakLat: number
  breakLon: number
  parkingLat: number
  parkingLon: number
  swell: DirectionSectorConfig
  wind: DirectionSectorConfig
}

const STORAGE_PREFIX = 'frameone.customSurfSpots.v1'

function clampDeg(v: number) {
  const n = Math.round(Number(v) || 0)
  return ((n % 360) + 360) % 360
}

function keyForUser(userId: string | null | undefined) {
  const id = String(userId || '').trim()
  return id ? `${STORAGE_PREFIX}:${id}` : `${STORAGE_PREFIX}:anon`
}

export function loadCustomSurfSpots(userId: string | null | undefined): CustomSurfSpot[] {
  if (typeof window === 'undefined') return []
  const id = String(userId || '').trim()
  if (!id) return []
  try {
    const raw = window.localStorage.getItem(keyForUser(id))
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((s: any) => normalizeCustomSpot(s)).filter(Boolean) as CustomSurfSpot[]
  } catch {
    return []
  }
}

export function saveCustomSurfSpots(userId: string | null | undefined, spots: CustomSurfSpot[]) {
  if (typeof window === 'undefined') return
  const id = String(userId || '').trim()
  if (!id) return
  const clean = spots.map((s) => normalizeCustomSpot(s)).filter(Boolean)
  window.localStorage.setItem(keyForUser(id), JSON.stringify(clean))
  // TODO: Replace localStorage persistence with Supabase custom_surf_spots table when available.
}

export function normalizeCustomSpot(input: any): CustomSurfSpot | null {
  if (!input || typeof input !== 'object') return null
  const label = String(input.label || '').trim().slice(0, 80)
  const spotId = String(input.spotId || '').trim().slice(0, 80)
  const breakLat = Number(input.breakLat)
  const breakLon = Number(input.breakLon)
  const parkingLat = Number(input.parkingLat)
  const parkingLon = Number(input.parkingLon)
  if (!label || !spotId || !Number.isFinite(breakLat) || !Number.isFinite(breakLon) || !Number.isFinite(parkingLat) || !Number.isFinite(parkingLon)) return null
  return {
    spotId,
    label,
    kind: 'custom',
    breakLat,
    breakLon,
    parkingLat,
    parkingLon,
    swell: {
      startDeg: clampDeg(input?.swell?.startDeg),
      endDeg: clampDeg(input?.swell?.endDeg),
      bestDeg: clampDeg(input?.swell?.bestDeg),
    },
    wind: {
      startDeg: clampDeg(input?.wind?.startDeg),
      endDeg: clampDeg(input?.wind?.endDeg),
      bestDeg: clampDeg(input?.wind?.bestDeg),
    },
  }
}
