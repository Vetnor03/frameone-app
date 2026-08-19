// app/api/surf/experience/log/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findSpotByLabel, SURF_SPOTS } from '@/app/lib/surf/spots'
import { correctedHeightForSwellSelection, pickBestSwell, selectedSwellFromPick } from '@/app/lib/surf/swellSelection'
import { fetchOpenMeteoJson } from '@/app/lib/server/openMeteo'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fetchCustomSpotForUser(userId: string, spotIdOrName: string) {
  const q = String(spotIdOrName || '').trim()
  if (!q) return null

  const cleanId = q.startsWith('custom:') ? q.slice('custom:'.length).trim() : q

  const byId = await supabaseAdmin
    .from('custom_surf_spots')
    .select('id,name,lat,lon,user_id')
    .eq('user_id', userId)
    .eq('id', cleanId)
    .maybeSingle()

  if (byId.data) return byId.data

  const byName = await supabaseAdmin
    .from('custom_surf_spots')
    .select('id,name,lat,lon,user_id')
    .eq('user_id', userId)
    .ilike('name', q)
    .maybeSingle()

  return byName.data || null
}

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
    condition_signature: any
    contributing_swell_indexes: number[]
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

async function fetchMarineAtTime(lat: number, lon: number, loggedAtIso: string, spotKey: string): Promise<MarinePoint> {
  const [marineFetched, windFetched] = await Promise.all([
    fetchOpenMeteoJson({ dataType: 'surf', endpoint: 'marine', lat, lon, hourly: ['wave_height', 'wave_direction', 'wave_period', 'secondary_swell_wave_height', 'secondary_swell_wave_direction', 'secondary_swell_wave_period'], timezone: 'UTC', pastDays: 7, forecastDays: 7, timeoutMs: 12000, forecastRange: 'past7-forecast7d', frameRequest: false, allowStale: true }),
    fetchOpenMeteoJson({ dataType: 'surf', endpoint: 'forecast', lat, lon, hourly: ['wind_speed_10m', 'wind_direction_10m'], timezone: 'UTC', pastDays: 7, forecastDays: 7, params: { wind_speed_unit: 'ms' }, timeoutMs: 12000, forecastRange: 'past7-forecast7d', frameRequest: false, allowStale: true }),
  ])

  if (!marineFetched.payload) throw new Error('Marine fetch failed')
  if (!windFetched.payload) throw new Error('Wind fetch failed')

  const marine: any = marineFetched.payload
  const wind: any = windFetched.payload

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

  const selectionConditions = {
    time_utc: mt[mi],
    primary: { present: primary.height > 0.01, height_m: primary.height, direction_deg_from: primary.dir, period_s: primary.period },
    secondary: { present: secondary.height >= 0.05, height_m: secondary.height, direction_deg_from: secondary.dir, period_s: secondary.period },
    wind_speed_ms: windSpeed,
    wind_direction_deg_from: windDir,
  }
  const picked = pickBestSwell({ spotKey, marine: selectionConditions })
  const chosenSwell = selectedSwellFromPick(selectionConditions, picked)
  const chosenData = { height: chosenSwell.height_m, dir: chosenSwell.direction_deg_from, period: chosenSwell.period_s }

  return {
    time: mt[mi],

    wave_height: chosenData.height,
    wave_direction: chosenData.dir,
    wave_period: chosenData.period,

    wind_speed_10m: windSpeed,
    wind_direction_10m: windDir,

    debug: {
      primary,
      secondary,
      chosen: chosenData,
      chosen_source: picked.chosen,
      primary_rating: Number(picked.primaryScore?.rating ?? 0),
      secondary_rating: Number(picked.secondaryScore?.rating ?? 0),
      primary_tables_total:
        Number.isFinite(Number(picked.primaryScore?.breakdown?.tables?.total ?? -Infinity)) && Number(picked.primaryScore?.breakdown?.tables?.total ?? -Infinity) !== -Infinity
          ? Number(picked.primaryScore?.breakdown?.tables?.total ?? -Infinity)
          : null,
      secondary_tables_total:
        Number.isFinite(Number(picked.secondaryScore?.breakdown?.tables?.total ?? -Infinity) as number) && Number(picked.secondaryScore?.breakdown?.tables?.total ?? -Infinity) !== -Infinity
          ? (Number(picked.secondaryScore?.breakdown?.tables?.total ?? -Infinity) as number)
          : null,
      primary_corrected_height: correctedHeightForSwellSelection(primary.height, primary.period),
      secondary_corrected_height: correctedHeightForSwellSelection(secondary.height, secondary.period),
      condition_signature: {
        spotKey,
        swells: [
          { index: 1, height_m: primary.height, period_s: primary.period, direction_deg_from: primary.dir },
          ...(secondary.height > 0.05 ? [{ index: 2, height_m: secondary.height, period_s: secondary.period, direction_deg_from: secondary.dir }] : []),
        ],
        wind_speed_ms: windSpeed,
        wind_direction_deg_from: windDir,
        forecast_time_utc: mt[mi],
      },
      contributing_swell_indexes: [
        1,
        ...(secondary.height > 0.05 ? [2] : []),
      ],
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

    const spotIdRaw = String(spotId).trim()
    const byId = Object.values(SURF_SPOTS).find((s) => s.spotId === spotIdRaw) || null
    const byLabel = findSpotByLabel(String(spot).trim())
    const resolved = byId || byLabel

    if (!resolved) {
      const custom = await fetchCustomSpotForUser(user.id, spotIdRaw || String(spot).trim())
      if (!custom) {
        return NextResponse.json({ error: 'Unknown surf spot' }, { status: 400 })
      }

      resolvedSpotId = String(custom.id)
      resolvedSpotLabel = String(custom.name)
      lat = Number(custom.lat)
      lon = Number(custom.lon)

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json({ error: 'Spot coordinates missing' }, { status: 400 })
      }
    } else {
      resolvedSpotId = String(resolved.spotId)
      resolvedSpotLabel = String(resolved.label)
      lat = Number(resolved.lat)
      lon = Number(resolved.lon)
    }

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
          primary_swell_height_m: marine.debug.primary.height,
          primary_swell_period_s: marine.debug.primary.period,
          primary_swell_dir_from_deg: marine.debug.primary.dir,
          secondary_swell_height_m: marine.debug.secondary.height,
          secondary_swell_period_s: marine.debug.secondary.period,
          secondary_swell_dir_from_deg: marine.debug.secondary.dir,
          selected_swell_index: marine.debug.chosen_source === 'secondary' ? 2 : 1,
          condition_signature: marine.debug.condition_signature,
          forecast_time_utc: marine.time,
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
          primary_swell_height_m: marine.debug.primary.height,
          primary_swell_period_s: marine.debug.primary.period,
          primary_swell_dir_from_deg: marine.debug.primary.dir,
          secondary_swell_height_m: marine.debug.secondary.height,
          secondary_swell_period_s: marine.debug.secondary.period,
          secondary_swell_dir_from_deg: marine.debug.secondary.dir,
          selected_swell_index: marine.debug.chosen_source === 'secondary' ? 2 : 1,
          condition_signature: marine.debug.condition_signature,
          forecast_time_utc: marine.time,
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
        primary_swell_height_m: marine.debug.primary.height,
        primary_swell_period_s: marine.debug.primary.period,
        primary_swell_dir_from_deg: marine.debug.primary.dir,
        secondary_swell_height_m: marine.debug.secondary.height,
        secondary_swell_period_s: marine.debug.secondary.period,
        secondary_swell_dir_from_deg: marine.debug.secondary.dir,
        selected_swell_index: marine.debug.chosen_source === 'secondary' ? 2 : 1,
        condition_signature: marine.debug.condition_signature,
        forecast_time_utc: marine.time,
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
        primary_swell_height_m: marine.debug.primary.height,
        primary_swell_period_s: marine.debug.primary.period,
        primary_swell_dir_from_deg: marine.debug.primary.dir,
        secondary_swell_height_m: marine.debug.secondary.height,
        secondary_swell_period_s: marine.debug.secondary.period,
        secondary_swell_dir_from_deg: marine.debug.secondary.dir,
        selected_swell_index: marine.debug.chosen_source === 'secondary' ? 2 : 1,
        condition_signature: marine.debug.condition_signature,
        forecast_time_utc: marine.time,
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
