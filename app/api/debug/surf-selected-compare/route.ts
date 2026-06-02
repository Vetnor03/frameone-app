import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SURF_SPOTS } from '@/app/lib/surf/spots'
import { normalizeSurfRating1to6 } from '@/app/lib/surf/ratings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UnknownRecord = Record<string, unknown>
type CompareCaseKey = 'frameBuiltIn' | 'mirrorBuiltIn' | 'frameCustom' | 'mirrorCustom'
type SurfCompareCase = {
  label: string
  endpoint: string
  diagnosticEndpoint?: string
  device_id: string
  frame_id: string
  spot: {
    id: string | null
    name: string | null
    type: 'built-in' | 'custom' | 'unknown'
  }
  resolved: {
    forecast: unknown
    coordinateResolution: unknown
    experienceSpotId: string | null
  }
  selected: {
    timestamp: string | null
    waveMinM: number | null
    waveMaxM: number | null
    waveRange: string | null
    periodS: number | null
    swellDirectionDeg: number | null
    windSpeedMs: number | null
    windDirectionDeg: number | null
    rating: number | null
  }
  payload: UnknownRecord
  diagnosticPayload?: UnknownRecord
}

type Divergence = {
  field: string
  left: unknown
  right: unknown
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function appOrigin(req: Request) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

function debugRouteEnabled(req: Request) {
  const url = new URL(req.url)
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.SURF_SELECTED_COMPARE_DEBUG === '1'
}

function stripCustomPrefix(spotId: string) {
  return spotId.trim().startsWith('custom:') ? spotId.trim().slice('custom:'.length).trim() : spotId.trim()
}

function spotType(spotId: string | null): 'built-in' | 'custom' | 'unknown' {
  if (!spotId) return 'unknown'
  return SURF_SPOTS[spotId] ? 'built-in' : 'custom'
}

function resolvedSpotId(payload: UnknownRecord) {
  const picked = asRecord(payload.picked)
  return asString(payload.spotId || payload.spot_id || picked.spotId || picked.spot_id).trim() || null
}

function resolvedExperienceSpotId(payload: UnknownRecord, requestedSpotId: string) {
  const geo = asRecord(payload.geo)
  const coord = asRecord(geo.coordinate_resolution)
  return asString(coord.matchedSpotId).trim() || resolvedSpotId(payload) || requestedSpotId || null
}

function valueAtPath(record: UnknownRecord, path: string) {
  return path.split('.').reduce<unknown>((current, part) => asRecord(current)[part], record)
}

function endpointPath(url: URL) {
  return `${url.pathname}?${url.searchParams.toString()}`
}

function buildScoreUrl(origin: string, deviceId: string, spotId: string, mode: 'frame' | 'mirror') {
  const url = new URL('/api/surf/score', origin)
  url.searchParams.set('spotId', spotId)
  url.searchParams.set('hours', '4')
  url.searchParams.set('frame', '1')
  url.searchParams.set('device_id', deviceId)
  if (mode === 'mirror') {
    url.searchParams.set('dayparts', '1')
    url.searchParams.set('daily', '1')
    url.searchParams.set('days', '5')
  }
  return url
}

function buildDiagnosticUrl(scoreUrl: URL) {
  const url = new URL(scoreUrl.toString())
  url.searchParams.delete('frame')
  return url
}

async function fetchJson(url: URL, token: string) {
  const res = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = asRecord(await res.json().catch(() => ({})))
  if (!res.ok) {
    throw new Error(`${endpointPath(url)} failed with ${res.status}: ${asString(data.error, 'unknown error')}`)
  }
  return data
}

function normalizeCase(args: {
  label: string
  deviceId: string
  requestedSpotId: string
  endpoint: URL
  payload: UnknownRecord
  diagnosticEndpoint?: URL
  diagnosticPayload?: UnknownRecord
}): SurfCompareCase {
  const diagnostic = args.diagnosticPayload ?? args.payload
  const forecast = asRecord(diagnostic.forecast)
  const inputs = asRecord(diagnostic.inputs)
  const geo = asRecord(diagnostic.geo)
  const resolvedId = resolvedSpotId(diagnostic) || resolvedSpotId(args.payload) || args.requestedSpotId
  const rating = normalizeSurfRating1to6(diagnostic).rating ?? normalizeSurfRating1to6(args.payload).rating ?? null

  return {
    label: args.label,
    endpoint: endpointPath(args.endpoint),
    diagnosticEndpoint: args.diagnosticEndpoint ? endpointPath(args.diagnosticEndpoint) : undefined,
    device_id: args.deviceId,
    frame_id: args.deviceId,
    spot: {
      id: resolvedId,
      name: asString(diagnostic.spot || args.payload.spot).trim() || null,
      type: spotType(resolvedId),
    },
    resolved: {
      forecast: geo.forecast ?? null,
      coordinateResolution: geo.coordinate_resolution ?? null,
      experienceSpotId: resolvedExperienceSpotId(diagnostic, args.requestedSpotId),
    },
    selected: {
      timestamp: asString(diagnostic.time_utc || inputs.time_utc).trim() || null,
      waveMinM: asNumber(forecast.wave_height_min_m),
      waveMaxM: asNumber(forecast.wave_height_max_m),
      waveRange: asString(forecast.wave_height_range_label || diagnostic.line1 || diagnostic.line2).trim() || null,
      periodS: asNumber(inputs.swell_period_s),
      swellDirectionDeg: asNumber(inputs.swell_direction_deg),
      windSpeedMs: asNumber(inputs.wind_speed_ms),
      windDirectionDeg: asNumber(inputs.wind_direction_deg),
      rating,
    },
    payload: args.payload,
    diagnosticPayload: args.diagnosticPayload,
  }
}

function compareCases(left: SurfCompareCase, right: SurfCompareCase, options?: { includeEndpoint?: boolean }) {
  const fields = [
    ['endpoint', 'endpoint'],
    ['device_id', 'device_id'],
    ['frame_id', 'frame_id'],
    ['spot.id', 'spot.id'],
    ['spot.name', 'spot.name'],
    ['spot.type', 'spot.type'],
    ['resolved.forecast', 'resolved.forecast'],
    ['resolved.coordinateResolution', 'resolved.coordinateResolution'],
    ['resolved.experienceSpotId', 'resolved.experienceSpotId'],
    ['selected.timestamp', 'selected.timestamp'],
    ['selected.waveMinM', 'selected.waveMinM'],
    ['selected.waveMaxM', 'selected.waveMaxM'],
    ['selected.waveRange', 'selected.waveRange'],
    ['selected.periodS', 'selected.periodS'],
    ['selected.swellDirectionDeg', 'selected.swellDirectionDeg'],
    ['selected.windSpeedMs', 'selected.windSpeedMs'],
    ['selected.windDirectionDeg', 'selected.windDirectionDeg'],
    ['selected.rating', 'selected.rating'],
  ] as const

  const activeFields = options?.includeEndpoint === false
    ? fields.filter(([field]) => field !== 'endpoint')
    : fields

  const divergences: Divergence[] = []
  for (const [field, path] of activeFields) {
    const leftValue = valueAtPath(left as unknown as UnknownRecord, path)
    const rightValue = valueAtPath(right as unknown as UnknownRecord, path)
    if (JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
      divergences.push({ field, left: leftValue, right: rightValue })
    }
  }

  return {
    matches: divergences.length === 0,
    firstDivergence: divergences[0] ?? null,
    divergences,
  }
}

export async function GET(req: Request) {
  try {
    if (!debugRouteEnabled(req)) {
      return NextResponse.json(
        { error: 'Debug route disabled. Set SURF_SELECTED_COMPARE_DEBUG=1 to enable outside local/dev.' },
        { status: 404 }
      )
    }

    const url = new URL(req.url)
    const debug = (url.searchParams.get('debug') || '').trim()
    if (debug !== 'selected-surf') {
      return NextResponse.json({ error: 'Missing debug=selected-surf' }, { status: 400 })
    }

    const deviceId = (url.searchParams.get('device_id') || url.searchParams.get('frame_id') || '').trim()
    if (!deviceId) return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })

    const builtInSpotId = stripCustomPrefix(url.searchParams.get('builtInSpotId') || url.searchParams.get('built_in_spot_id') || 'hellesto')
    const customSpotIdRaw = url.searchParams.get('customSpotId') || url.searchParams.get('custom_spot_id') || ''
    const customSpotId = stripCustomPrefix(customSpotIdRaw)
    if (!customSpotId) {
      return NextResponse.json({ error: 'Missing customSpotId/custom_spot_id for Hellestø Custom' }, { status: 400 })
    }

    const bearer = getBearerToken(req)
    if (!bearer) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: authData, error: authError } = await supabase.auth.getUser(bearer)
    if (authError || !authData.user) return NextResponse.json({ error: 'Invalid user token' }, { status: 401 })

    const [{ data: member, error: memberError }, { data: deviceRow, error: deviceError }] = await Promise.all([
      supabase
        .from('device_members')
        .select('device_id')
        .eq('device_id', deviceId)
        .eq('user_id', authData.user.id)
        .maybeSingle(),
      supabase.from('devices').select('device_token').eq('device_id', deviceId).maybeSingle(),
    ])
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
    if (deviceError) return NextResponse.json({ error: deviceError.message }, { status: 500 })
    if (!member) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

    const deviceToken = asString(deviceRow?.device_token)
    if (!deviceToken) return NextResponse.json({ error: 'Missing device token for frame-style comparison' }, { status: 500 })

    const origin = appOrigin(req)
    const requests: Array<{ key: CompareCaseKey; label: string; spotId: string; mode: 'frame' | 'mirror' }> = [
      { key: 'frameBuiltIn', label: `frame selected ${builtInSpotId}`, spotId: builtInSpotId, mode: 'frame' },
      { key: 'mirrorBuiltIn', label: `mirror selected ${builtInSpotId}`, spotId: builtInSpotId, mode: 'mirror' },
      { key: 'frameCustom', label: `frame selected custom ${customSpotId}`, spotId: customSpotId, mode: 'frame' },
      { key: 'mirrorCustom', label: `mirror selected custom ${customSpotId}`, spotId: customSpotId, mode: 'mirror' },
    ]

    const cases = {} as Record<CompareCaseKey, SurfCompareCase>
    for (const request of requests) {
      const endpoint = buildScoreUrl(origin, deviceId, request.spotId, request.mode)
      const diagnosticEndpoint = buildDiagnosticUrl(endpoint)
      const [payload, diagnosticPayload] = await Promise.all([
        fetchJson(endpoint, deviceToken),
        fetchJson(diagnosticEndpoint, deviceToken),
      ])
      cases[request.key] = normalizeCase({
        label: request.label,
        deviceId,
        requestedSpotId: request.spotId,
        endpoint,
        payload,
        diagnosticEndpoint,
        diagnosticPayload,
      })
    }

    return NextResponse.json({
      temporary: true,
      route: '/api/debug/surf-selected-compare',
      guard: 'Requires debug=selected-surf, authenticated device member, and local/dev or SURF_SELECTED_COMPARE_DEBUG=1.',
      requested: {
        device_id: deviceId,
        frame_id: deviceId,
        builtInSpotId,
        customSpotId,
      },
      cases,
      comparisons: {
        builtInFrameVsMirror: compareCases(cases.frameBuiltIn, cases.mirrorBuiltIn),
        customFrameVsMirror: compareCases(cases.frameCustom, cases.mirrorCustom),
        frameBuiltInVsCustom: compareCases(cases.frameBuiltIn, cases.frameCustom),
        mirrorBuiltInVsCustom: compareCases(cases.mirrorBuiltIn, cases.mirrorCustom),
      },
      selectedValueComparisons: {
        note: 'Same comparisons excluding endpoint/path, so extra mirror daypart/daily query params do not hide selected-condition value drift.',
        builtInFrameVsMirror: compareCases(cases.frameBuiltIn, cases.mirrorBuiltIn, { includeEndpoint: false }),
        customFrameVsMirror: compareCases(cases.frameCustom, cases.mirrorCustom, { includeEndpoint: false }),
        frameBuiltInVsCustom: compareCases(cases.frameBuiltIn, cases.frameCustom, { includeEndpoint: false }),
        mirrorBuiltInVsCustom: compareCases(cases.mirrorBuiltIn, cases.mirrorCustom, { includeEndpoint: false }),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
