// app/api/surf/experience/log/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findSpotByLabel, SURF_SPOTS } from '@/app/lib/surf/spots'
import { scoreSurf } from '@/app/lib/surfScoring'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type SwellPart = {
  height: number
  dir: number
  period: number
}

type MarinePoint = {
  time: string

  wave_height: number
  wave_direction: number
  wave_period: number

  wind_speed_10m: number
  wind_direction_10m: number

  debug: {
    primary: SwellPart
    secondary: SwellPart
    chosen: SwellPart
    chosen_source: 'primary' | 'secondary'
    primary_rating: number
    secondary_rating: number
    primary_tables_total: number | null
    secondary_tables_total: number | null
    primary_corrected_height: number
    secondary_corrected_height: number
  }
}

function toNum(v: any) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function nearestHourIndex(times: string[], targetIsoHourUtc: string) {
  const idx = times.indexOf(targetIsoHourUtc)
  if (idx >= 0) return idx

  const t = Date.parse(targetIsoHourUtc + ':00Z')
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY

  for (let i = 0; i < times.length; i++) {
    const ti = Date.parse(times[i] + ':00Z')
    const dist = Math.abs(ti - t)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }

  return best
}

function isoHourUTCFromDate(d: Date) {
  const x = new Date(d)
  x.setUTCMinutes(0, 0, 0)
  return x.toISOString().slice(0, 13) + ':00'
}

function correctedHeight(h: number, p: number) {
  if (!(h > 0) || !(p > 0)) return h
  return h * (p / 10)
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

function pickLoggedSwell(args: {
  spotKey: string
  primary: SwellPart
  secondary: SwellPart
  windSpeed: number
  windDir: number
}) {
  const { spotKey, primary, secondary, windSpeed, windDir } = args

  const primaryScore = scoreSurf({
    spotKey,
    swellHeightM: primary.height,
    swellPeriodS: primary.period,
    swellDirDeg: primary.dir,
    windSpeedMs: windSpeed,
    windDirDeg: windDir,
  })

  if (!(secondary.height > 0.05)) {
    return {
      chosen: 'primary' as const,
      chosenData: primary,
      primaryScore,
      secondaryScore: null as any,
      primaryTablesTotal: Number(primaryScore?.breakdown?.tables?.total ?? -Infinity),
      secondaryTablesTotal: null as number | null,
      primaryCorrectedHeight: correctedHeight(primary.height, primary.period),
      secondaryCorrectedHeight: correctedHeight(secondary.height, secondary.period),
    }
  }

  const secondaryScore = scoreSurf({
    spotKey,
    swellHeightM: secondary.height,
    swellPeriodS: secondary.period,
    swellDirDeg: secondary.dir,
    windSpeedMs: windSpeed,
    windDirDeg: windDir,
  })

  const pRating = Number(primaryScore?.rating ?? 0)
  const sRating = Number(secondaryScore?.rating ?? 0)

  if (sRating > pRating) {
    return {
      chosen: 'secondary' as const,
      chosenData: secondary,
      primaryScore,
      secondaryScore,
      primaryTablesTotal: Number(primaryScore?.breakdown?.tables?.total ?? -Infinity),
      secondaryTablesTotal: Number(secondaryScore?.breakdown?.tables?.total ?? -Infinity),
      primaryCorrectedHeight: correctedHeight(primary.height, primary.period),
      secondaryCorrectedHeight: correctedHeight(secondary.height, secondary.period),
    }
  }

  if (pRating > sRating) {
    return {
      chosen: 'primary' as const,
      chosenData: primary,
      primaryScore,
      secondaryScore,
      primaryTablesTotal: Number(primaryScore?.breakdown?.tables?.total ?? -Infinity),
      secondaryTablesTotal: Number(secondaryScore?.breakdown?.tables?.total ?? -Infinity),
      primaryCorrectedHeight: correctedHeight(primary.height, primary.period),
      secondaryCorrectedHeight: correctedHeight(secondary.height, secondary.period),
    }
  }

  const pTotal = Number(primaryScore?.breakdown?.tables?.total ?? -Infinity)
  const sTotal = Number(secondaryScore?.breakdown?.tables?.total ?? -Infinity)

  if (sTotal > pTotal) {
    return {
      chosen: 'secondary' as const,
      chosenData: secondary,
      primaryScore,
      secondaryScore,
      primaryTablesTotal: pTotal,
      secondaryTablesTotal: sTotal,
      primaryCorrectedHeight: correctedHeight(primary.height, primary.period),
      secondaryCorrectedHeight: correctedHeight(secondary.height, secondary.period),
    }
  }

  if (pTotal > sTotal) {
    return {
      chosen: 'primary' as const,
      chosenData: primary,
      primaryScore,
      secondaryScore,
      primaryTablesTotal: pTotal,
      secondaryTablesTotal: sTotal,
      primaryCorrectedHeight: correctedHeight(primary.height, primary.period),
      secondaryCorrectedHeight: correctedHeight(secondary.height, secondary.period),
    }
  }

  const pCorr = correctedHeight(primary.height, primary.period)
  const sCorr = correctedHeight(secondary.height, secondary.period)

  if (sCorr > pCorr) {
    return {
      chosen: 'secondary' as const,
      chosenData: secondary,
      primaryScore,
      secondaryScore,
      primaryTablesTotal: pTotal,
      secondaryTablesTotal: sTotal,
      primaryCorrectedHeight: pCorr,
      secondaryCorrectedHeight: sCorr,
    }
  }

  return {
    chosen: 'primary' as const,
    chosenData: primary,
    primaryScore,
    secondaryScore,
    primaryTablesTotal: pTotal,
    secondaryTablesTotal: sTotal,
    primaryCorrectedHeight: pCorr,
    secondaryCorrectedHeight: sCorr,
  }
}

async function fetchMarineAtTime(lat: number, lon: number, loggedAtIso: string, spotKey: string): Promise<MarinePoint> {
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=` +
    `wave_height,wave_direction,wave_period,` +
    `secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period` +
    `&timezone=UTC` +
    `&past_days=7` +
    `&forecast_days=7`

  const windUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=wind_speed_10m,wind_direction_10m` +
    `&timezone=UTC` +
    `&wind_speed_unit=ms` +
    `&past_days=7` +
    `&forecast_days=7`

  const [marineResp, windResp] = await Promise.all([
    fetchWithTimeout(marineUrl, {}, 12000),
    fetchWithTimeout(windUrl, {}, 12000),
  ])

  if (!marineResp.ok) throw new Error('Marine fetch failed')
  if (!windResp.ok) throw new Error('Wind fetch failed')

  const marine: any = await marineResp.json()
  const wind: any = await windResp.json()

  const mt: string[] = Array.isArray(marine?.hourly?.time) ? marine.hourly.time : []
  const wt: string[] = Array.isArray(wind?.hourly?.time) ? wind.hourly.time : []

  if (!mt.length || !wt.length) throw new Error('Missing hourly time series')

  const targetIsoHour = isoHourUTCFromDate(new Date(loggedAtIso))

  const mi = nearestHourIndex(mt, targetIsoHour)
  const wi = nearestHourIndex(wt, targetIsoHour)

  const primary: SwellPart = {
    height: toNum(marine?.hourly?.wave_height?.[mi]),
    dir: toNum(marine?.hourly?.wave_direction?.[mi]),
    period: toNum(marine?.hourly?.wave_period?.[mi]),
  }

  const secondary: SwellPart = {
    height: toNum(marine?.hourly?.secondary_swell_wave_height?.[mi]),
    dir: toNum(marine?.hourly?.secondary_swell_wave_direction?.[mi]),
    period: toNum(marine?.hourly?.secondary_swell_wave_period?.[mi]),
  }

  const windSpeed = toNum(wind?.hourly?.wind_speed_10m?.[wi])
  const windDir = toNum(wind?.hourly?.wind_direction_10m?.[wi])

  const picked = pickLoggedSwell({
    spotKey,
    primary,
    secondary,
    windSpeed,
    windDir,
  })

  return {
    time: mt[mi],

    wave_height: picked.chosenData.height,
    wave_direction: picked.chosenData.dir,
    wave_period: picked.chosenData.period,

    wind_speed_10m: windSpeed,
    wind_direction_10m: windDir,

    debug: {
      primary,
      secondary,
      chosen: picked.chosenData,
      chosen_source: picked.chosen,
      primary_rating: Number(picked.primaryScore?.rating ?? 0),
      secondary_rating: Number(picked.secondaryScore?.rating ?? 0),
      primary_tables_total:
        Number.isFinite(picked.primaryTablesTotal) && picked.primaryTablesTotal !== -Infinity
          ? picked.primaryTablesTotal
          : null,
      secondary_tables_total:
        Number.isFinite(picked.secondaryTablesTotal as number) && picked.secondaryTablesTotal !== -Infinity
          ? (picked.secondaryTablesTotal as number)
          : null,
      primary_corrected_height: picked.primaryCorrectedHeight,
      secondary_corrected_height: picked.secondaryCorrectedHeight,
    },
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const {
      data: { user },
      error: userErr,
    } = await supabaseAdmin.auth.getUser(token)

    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid user token' }, { status: 401 })
    }

    const body = await req.json()

    const {
      spotId,
      spot,
      loggedAt,
      rating_1_6,
      mode = 'detect',
      existingId = null,
    } = body || {}

    if (!spotId || !spot || !loggedAt || !rating_1_6) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const ratingNum = Math.round(Number(rating_1_6))
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 6) {
      return NextResponse.json({ error: 'rating_1_6 must be between 1 and 6' }, { status: 400 })
    }

    let lat: number | null = null
    let lon: number | null = null
    let resolvedSpotLabel: string | null = null
    let resolvedSpotId: string | null = null

    const byId = Object.values(SURF_SPOTS).find((s) => s.spotId === String(spotId).trim()) || null
    const byLabel = findSpotByLabel(String(spot).trim())
    const resolved = byId || byLabel

    if (!resolved) {
      return NextResponse.json({ error: 'Unknown surf spot' }, { status: 400 })
    }

    resolvedSpotId = String(resolved.spotId)
    resolvedSpotLabel = String(resolved.label)
    lat = Number(resolved.lat)
    lon = Number(resolved.lon)

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: 'Spot coordinates missing' }, { status: 400 })
    }

    const loggedAtDate = new Date(loggedAt)
    if (!Number.isFinite(loggedAtDate.getTime())) {
      return NextResponse.json({ error: 'Invalid loggedAt' }, { status: 400 })
    }

    if (mode === 'detect') {
      const start = new Date(loggedAtDate.getTime() - 2 * 3600 * 1000)
      const end = new Date(loggedAtDate.getTime() + 2 * 3600 * 1000)

      const { data: existing, error: dupErr } = await supabaseAdmin
        .from('user_surf_experiences')
        .select('*')
        .eq('user_id', user.id)
        .eq('spot_id', resolvedSpotId)
        .gte('logged_at', start.toISOString())
        .lte('logged_at', end.toISOString())
        .order('logged_at', { ascending: false })
        .limit(1)

      if (dupErr) throw dupErr

      if (existing && existing.length > 0) {
        return NextResponse.json({
          duplicate: true,
          existing: existing[0],
        })
      }
    }

    const marine = await fetchMarineAtTime(lat, lon, loggedAt, resolvedSpotLabel)

    if (mode === 'update_existing' && existingId) {
      const { error } = await supabaseAdmin
        .from('user_surf_experiences')
        .update({
          spot_id: resolvedSpotId,
          spot: resolvedSpotLabel,
          logged_at: loggedAtDate.toISOString(),
          wave_dir_from_deg: marine.wave_direction,
          wave_height_m: marine.wave_height,
          wave_period_s: marine.wave_period,
          wind_dir_from_deg: marine.wind_direction_10m,
          wind_speed_ms: marine.wind_speed_10m,
          rating_1_6: ratingNum,
        })
        .eq('id', existingId)
        .eq('user_id', user.id)

      if (error) throw error

      return NextResponse.json({
        ok: true,
        mode: 'update_existing',
        stored: {
          spot_id: resolvedSpotId,
          spot: resolvedSpotLabel,
          logged_at: loggedAtDate.toISOString(),
          wave_dir_from_deg: marine.wave_direction,
          wave_height_m: marine.wave_height,
          wave_period_s: marine.wave_period,
          wind_dir_from_deg: marine.wind_direction_10m,
          wind_speed_ms: marine.wind_speed_10m,
          rating_1_6: ratingNum,
        },
        debug: marine.debug,
      })
    }

    const { error } = await supabaseAdmin
      .from('user_surf_experiences')
      .insert({
        user_id: user.id,
        spot_id: resolvedSpotId,
        spot: resolvedSpotLabel,
        logged_at: loggedAtDate.toISOString(),
        wave_dir_from_deg: marine.wave_direction,
        wave_height_m: marine.wave_height,
        wave_period_s: marine.wave_period,
        wind_dir_from_deg: marine.wind_direction_10m,
        wind_speed_ms: marine.wind_speed_10m,
        rating_1_6: ratingNum,
      })

    if (error) throw error

    return NextResponse.json({
      ok: true,
      mode: 'insert',
      stored: {
        spot_id: resolvedSpotId,
        spot: resolvedSpotLabel,
        logged_at: loggedAtDate.toISOString(),
        wave_dir_from_deg: marine.wave_direction,
        wave_height_m: marine.wave_height,
        wave_period_s: marine.wave_period,
        wind_dir_from_deg: marine.wind_direction_10m,
        wind_speed_ms: marine.wind_speed_10m,
        rating_1_6: ratingNum,
      },
      debug: marine.debug,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}