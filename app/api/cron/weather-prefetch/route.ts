import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/app/lib/supabase/serviceClient'
import { fetchSharedFrameWeatherForecast, sharedWeatherCacheKey } from '@/app/lib/server/weatherSharedCache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTIVE_DEVICE_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_LOCATIONS_PER_RUN = 12
const MAX_RUN_MS = 45_000

type WeatherLocation = { lat: number; lon: number; days: number }
type DeviceSettings = { modules?: { weather?: Array<{ id?: number; lat?: number; lon?: number }> }; cells?: Array<{ module?: string }> }

function authenticated(req: Request) {
  const secret = process.env.FORECAST_PREFETCH_SECRET
  if (!secret || secret.length < 24) return false
  const sent = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  const actualBuffer = Buffer.from(sent)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

function weatherProfiles(settings: DeviceSettings): WeatherLocation[] {
  const cells = Array.isArray(settings.cells) ? settings.cells : []
  const weather = Array.isArray(settings.modules?.weather) ? settings.modules.weather : []
  const activeIds = new Set(cells.flatMap((cell) => {
    const match = /^weather(?::(\d+))?$/i.exec(String(cell.module || ''))
    return match ? [Number(match[1] ?? 1)] : []
  }))
  return weather.filter((location) => activeIds.has(Number(location.id ?? 1)))
    .flatMap((location) => {
      const lat = Number(location.lat)
      const lon = Number(location.lon)
      return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
        ? [{ lat, lon, days: 5 }]
        : []
    })
}

// Runs only on backend infrastructure. It never requests a frame refresh and
// never modifies device status or content revisions.
export async function GET(req: Request) {
  if (!process.env.FORECAST_PREFETCH_SECRET) {
    return NextResponse.json({ error: 'prefetch_not_configured' }, { status: 503 })
  }
  if (!authenticated(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const started = Date.now()
  const db = createServiceClient()
  const cutoff = new Date(started - ACTIVE_DEVICE_WINDOW_MS).toISOString()
  const [statusResult, configResult] = await Promise.all([
    db.from('device_status').select('device_id').gte('last_seen_at', cutoff).limit(1000),
    db.from('device_settings').select('device_id,settings_json').limit(1000),
  ])
  if (statusResult.error || configResult.error) {
    console.error('[weather-prefetch] device query failed', {
      status: statusResult.error?.code,
      settings: configResult.error?.code,
    })
    return NextResponse.json({ error: 'device_query_failed' }, { status: 503 })
  }
  const recent = new Set((statusResult.data ?? []).map((row) => row.device_id))
  const profiles = new Map<string, WeatherLocation>()
  for (const row of configResult.data ?? []) {
    if (!recent.has(row.device_id)) continue
    for (const loc of weatherProfiles((row.settings_json ?? {}) as DeviceSettings)) {
      profiles.set(sharedWeatherCacheKey(loc.lat, loc.lon, loc.days), loc)
    }
  }

  let inspected = 0
  let failed = 0
  let fresh = 0
  let reused = 0
  for (const loc of [...profiles.values()].slice(0, MAX_LOCATIONS_PER_RUN)) {
    if (Date.now() - started > MAX_RUN_MS) break
    inspected++
    try {
      const response = await fetchSharedFrameWeatherForecast({
        lat: loc.lat, lon: loc.lon, forecastDays: loc.days, timeoutMs: 6500,
      })
      if (!response.payload || response.debug.staleUsed) {
        failed++
        console.warn('[weather-prefetch] upstream unavailable', { error: response.error ?? 'using_last_good' })
      } else if (response.debug.externalFetch) {
        fresh++
      } else {
        reused++
      }
    } catch (error) {
      failed++
      console.warn('[weather-prefetch] fetch failed', { message: error instanceof Error ? error.message : 'unknown' })
    }
    // One profile at a time with a short gap, even if the source is healthy.
    if (inspected < profiles.size) await new Promise<void>((resolve) => setTimeout(resolve, 250))
  }

  console.info('[weather-prefetch]', {
    active_profiles: profiles.size, inspected, fresh, reused, failed,
    duration_ms: Date.now() - started,
  })
  return NextResponse.json({
    ok: failed === 0,
    active_profiles: profiles.size, inspected, fresh, reused, failed,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
