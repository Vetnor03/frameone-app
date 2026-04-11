// app/lib/fetchSurfScore.ts
import { supabase } from '@/app/lib/supabase'

type SurfScoreParams = {
  spotId?: string
  spot?: string
  lat?: number
  lon?: number
  hours?: number
  dayparts?: boolean
  daily?: boolean
  days?: number
  best?: boolean
  fuelPenalty?: boolean
  homeLat?: number
  homeLon?: number
}

function addParam(url: URL, key: string, value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return
  if (typeof value === 'string' && !value.trim()) return
  url.searchParams.set(key, String(value))
}

export async function fetchSurfScore(params: SurfScoreParams) {
  const url = new URL('/api/surf/score', window.location.origin)

  addParam(url, 'spotId', params.spotId)
  addParam(url, 'spot', params.spot)
  addParam(url, 'lat', params.lat)
  addParam(url, 'lon', params.lon)
  addParam(url, 'hours', params.hours)

  if (params.dayparts) addParam(url, 'dayparts', 1)
  if (params.daily) addParam(url, 'daily', 1)
  addParam(url, 'days', params.days)

  if (params.best !== undefined) addParam(url, 'best', params.best ? 1 : 0)

  if (params.fuelPenalty) addParam(url, 'fuelPenalty', 1)
  addParam(url, 'homeLat', params.homeLat)
  addParam(url, 'homeLon', params.homeLon)

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const resp = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: session?.access_token
      ? {
          Authorization: `Bearer ${session.access_token}`,
        }
      : {},
  })

  const data = await resp.json().catch(() => ({}))

  if (!resp.ok) {
    throw new Error(String(data?.error || `Surf score fetch failed (${resp.status})`))
  }

  return data
}