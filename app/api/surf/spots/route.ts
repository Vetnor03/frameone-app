import { NextResponse } from 'next/server'
import { SURF_SPOTS } from '@/app/lib/surf/spots'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TODAYS_BEST_LABEL = "Today's Best"
const TODAYS_BEST_ID = '__todays_best__'

type SpotItem = {
  spotId: string
  label: string
}

type CreateSpotBody = {
  name?: unknown
  lat?: unknown
  lng?: unknown
  parkingLat?: unknown
  parkingLng?: unknown
  swell?: { startAngle?: unknown; endAngle?: unknown } | null
  wind?: { startAngle?: unknown; endAngle?: unknown } | null
}

function getUserClient(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const bearer = req.headers.get('authorization') || ''
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: bearer ? { Authorization: bearer } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function uniqItems(list: SpotItem[]) {
  const seen = new Set<string>()
  const out: SpotItem[] = []

  for (const item of list) {
    const spotId = String(item?.spotId ?? '').trim()
    const label = String(item?.label ?? '').trim()
    if (!spotId || !label) continue

    const key = spotId.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ spotId, label })
  }

  return out
}

export async function GET(req: Request) {
  try {
    const items: SpotItem[] = Object.values(SURF_SPOTS)
      .filter(Boolean)
      .map((s) => ({
        spotId: String(s.spotId || '').trim(),
        label: String(s.label || '').trim(),
      }))
      .filter((s) => s.spotId && s.label)

    const supabase = getUserClient(req)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const customItems: SpotItem[] = []
    if (user?.id) {
      const { data } = await supabase
        .from('user_surf_spots')
        .select('id,name')
        .eq('user_id', user.id)
        .order('name', { ascending: true })
      for (const row of data || []) {
        customItems.push({ spotId: `user:${row.id}`, label: String(row.name || '').trim() })
      }
    }

    const sorted = uniqItems([...items, ...customItems]).sort((a, b) => a.label.localeCompare(b.label, 'nb'))

    const cleaned = [
      { spotId: TODAYS_BEST_ID, label: TODAYS_BEST_LABEL },
      ...sorted.filter((x) => x.spotId !== TODAYS_BEST_ID),
    ]

    return NextResponse.json(
      {
        spots: cleaned.map((x) => x.label),
        items: cleaned,
        todays_best: { id: TODAYS_BEST_ID, label: TODAYS_BEST_LABEL },
      },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  } catch (e: any) {
    return NextResponse.json(
      { spots: [], items: [], error: String(e?.message || e) },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getUserClient(req)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as CreateSpotBody
    const name = String(body?.name ?? '').trim().slice(0, 80)
    const lat = Number(body?.lat)
    const lng = Number(body?.lng)
    const parkingLat = Number(body?.parkingLat)
    const parkingLng = Number(body?.parkingLng)
    const swellStartAngle = Number(body?.swell?.startAngle)
    const swellEndAngle = Number(body?.swell?.endAngle)
    const windStartAngle = Number(body?.wind?.startAngle)
    const windEndAngle = Number(body?.wind?.endAngle)

    if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })
    const nums = [lat, lng, parkingLat, parkingLng, swellStartAngle, swellEndAngle, windStartAngle, windEndAngle]
    if (nums.some((v) => !Number.isFinite(v))) {
      return NextResponse.json({ error: 'Invalid numeric payload' }, { status: 400 })
    }

    const payload = {
      user_id: user.id,
      name,
      lat,
      lng,
      parking_lat: parkingLat,
      parking_lng: parkingLng,
      swell_start_angle: swellStartAngle,
      swell_end_angle: swellEndAngle,
      wind_start_angle: windStartAngle,
      wind_end_angle: windEndAngle,
    }
    const { data, error } = await supabase.from('user_surf_spots').insert(payload).select('id,name').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ item: { spotId: `user:${data.id}`, label: data.name } })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
