import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SURF_FRAME_RESULT_MIN_REFRESH_MS = 3 * 60 * 60 * 1000

function truthy(value: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true'
}

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}

function normalizedQuery(url: URL) {
  const excluded = new Set(['device_id', 'refresh', 'forceRefresh'])
  const numeric = new Set(['lat', 'lon', 'homeLat', 'homeLon'])

  return Array.from(url.searchParams.entries())
    .filter(([key]) => !excluded.has(key))
    .map(([key, raw]) => {
      if (!numeric.has(key)) return [key, raw] as const
      const value = Number(raw)
      return [key, Number.isFinite(value) ? value.toFixed(5) : raw] as const
    })
    .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
}

function frameResultCacheKey(deviceId: string, url: URL) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      version: 'v1',
      device_id: deviceId,
      query: normalizedQuery(url),
    }))
    .digest('hex')
}

function upstreamSurfUrl(url: URL) {
  const upstream = new URL('/api/surf/score', url.origin)
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'device_id') continue
    upstream.searchParams.append(key, value)
  }
  return upstream
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deviceId = deviceIdFrom(url.searchParams.get('device_id'))
  if (!deviceId) return jsonNoStore({ error: 'missing_device_id' }, 400)

  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return jsonNoStore({ error: auth.error }, auth.status)

  const cacheKey = frameResultCacheKey(deviceId, url)
  const refreshRequested = truthy(url.searchParams.get('refresh')) || truthy(url.searchParams.get('forceRefresh'))

  const cacheStartedAt = Date.now()
  const { data: cached, error: cacheReadError } = await auth.supabase
    .from('surf_frame_result_cache')
    .select('payload, refreshed_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (cacheReadError) {
    console.warn('[device/surf-frame] cache read failed', {
      device_id: deviceId,
      code: cacheReadError.code,
    })
  }

  if (cached?.payload && cached.refreshed_at) {
    const refreshedAtMs = Date.parse(String(cached.refreshed_at))
    const ageMs = Number.isFinite(refreshedAtMs)
      ? Math.max(0, Date.now() - refreshedAtMs)
      : Number.POSITIVE_INFINITY
    const scheduledRefreshDue =
      refreshRequested && ageMs >= SURF_FRAME_RESULT_MIN_REFRESH_MS

    if (!scheduledRefreshDue) {
      console.info('[device/surf-frame]', {
        device_id: deviceId,
        status: refreshRequested ? 'scheduled-not-due' : 'hit',
        age_ms: Number.isFinite(ageMs) ? ageMs : null,
        cache_read_ms: Date.now() - cacheStartedAt,
      })
      return jsonNoStore(cached.payload)
    }

    console.info('[device/surf-frame]', {
      device_id: deviceId,
      status: 'scheduled-refresh',
      age_ms: Number.isFinite(ageMs) ? ageMs : null,
    })
  }

  const upstreamStartedAt = Date.now()
  const upstream = await fetch(upstreamSurfUrl(url), {
    headers: {
      authorization: req.headers.get('authorization') ?? '',
    },
    cache: 'no-store',
  })

  const payload: unknown = await upstream.json().catch(() => ({ error: 'invalid_surf_response' }))
  if (!upstream.ok) return jsonNoStore(payload, upstream.status)

  const { error: cacheWriteError } = await auth.supabase
    .from('surf_frame_result_cache')
    .upsert({
      cache_key: cacheKey,
      payload,
      refreshed_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' })

  if (cacheWriteError) {
    console.warn('[device/surf-frame] cache write failed', {
      device_id: deviceId,
      code: cacheWriteError.code,
    })
  }

  console.info('[device/surf-frame]', {
    device_id: deviceId,
    status: cached ? 'refreshed' : 'miss-filled',
    upstream_ms: Date.now() - upstreamStartedAt,
    total_ms: Date.now() - cacheStartedAt,
  })

  return jsonNoStore(payload)
}
