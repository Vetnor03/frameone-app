import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function truthy(v: any) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'yes' || s === 'on'
  }
  if (typeof v === 'number') return v !== 0
  return false
}

function getMatchedFlag(payload: any): boolean {
  return (
    truthy(payload?.breakdown?.experience?.matched) ||
    truthy(payload?.experience?.matched) ||
    truthy(payload?.picked?.breakdown?.experience?.matched) ||
    truthy(payload?.picked?.experience?.matched)
  )
}

function getResolvedSpotId(payload: any): string | null {
  const candidates = [
    payload?.spotId,
    payload?.spot_id,
    payload?.picked?.spotId,
    payload?.picked?.spot_id,
  ]

  for (const c of candidates) {
    const s = String(c ?? '').trim()
    if (s) return s
  }

  return null
}

function buildScoreUrl(origin: string, reqUrl: URL) {
  const url = new URL('/api/surf/score', origin)

  const passThrough = [
    'spotId',
    'spot',
    'hours',
    'fuelPenalty',
    'homeLat',
    'homeLon',
  ]

  for (const key of passThrough) {
    const value = reqUrl.searchParams.get(key)
    if (value != null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  if (!url.searchParams.get('hours')) {
    url.searchParams.set('hours', '4')
  }

  return url.toString()
}

export async function GET(req: Request) {
  try {
    const reqUrl = new URL(req.url)
    const origin = reqUrl.origin

    const device_id = String(reqUrl.searchParams.get('device_id') || '').trim()
    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const scoreUrl = buildScoreUrl(origin, reqUrl)

    const scoreRes = await fetch(scoreUrl, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!scoreRes.ok) {
      return NextResponse.json(
        { error: `surf/score failed with ${scoreRes.status}` },
        { status: 500 }
      )
    }

    const score = await scoreRes.json()
    const matched = getMatchedFlag(score)
    const resolvedSpotId = getResolvedSpotId(score)

    if (!matched || !resolvedSpotId) {
      return NextResponse.json({
        device_id,
        matched: false,
        resolved_spot_id: resolvedSpotId,
        latest_logged_at: null,
        latest_experience_id: null,
        surf_signature: '__NO_MATCHED_EXPERIENCE__',
      })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: memberRow, error: memberError } = await supabase
      .from('device_members')
      .select('user_id')
      .eq('device_id', device_id)
      .order('user_id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 })
    }

    const user_id = memberRow?.user_id ?? null
    if (!user_id) {
      return NextResponse.json({
        device_id,
        matched: false,
        resolved_spot_id: resolvedSpotId,
        latest_logged_at: null,
        latest_experience_id: null,
        surf_signature: '__NO_DEVICE_MEMBER__',
      })
    }

    const { data: expRow, error: expError } = await supabase
      .from('user_surf_experiences')
      .select('id, logged_at, spot_id')
      .eq('user_id', user_id)
      .eq('spot_id', resolvedSpotId)
      .order('logged_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (expError) {
      return NextResponse.json({ error: expError.message }, { status: 500 })
    }

    const latestExperienceId = expRow?.id ?? null
    const latestLoggedAt = expRow?.logged_at ?? null

    const surf_signature =
      latestExperienceId && latestLoggedAt
        ? `${resolvedSpotId}|${latestExperienceId}|${latestLoggedAt}`
        : '__NO_MATCHED_EXPERIENCE__'

    return NextResponse.json({
      device_id,
      matched: true,
      resolved_spot_id: resolvedSpotId,
      latest_logged_at: latestLoggedAt,
      latest_experience_id: latestExperienceId,
      surf_signature,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}
