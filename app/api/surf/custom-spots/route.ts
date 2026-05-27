import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function authToken(req: Request) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : ''
}

export async function GET(req: Request) {
  const token = authToken(req)
  if (!token) return NextResponse.json({ items: [] })
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  const userId = userData?.user?.id
  if (!userId) return NextResponse.json({ items: [] })
  const { data, error } = await supabaseAdmin.from('custom_surf_spots').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(req: Request) {
  const token = authToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  const userId = userData?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: any = await req.json()
  const row = { ...body, user_id: userId }
  const { data, error } = await supabaseAdmin.from('custom_surf_spots').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ item: data })
}

export async function PUT(req: Request) {
  const token = authToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  const userId = userData?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: any = await req.json()
  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const patch = {
    name: body?.name,
    lat: body?.lat,
    lon: body?.lon,
    spot_zoom: body?.spot_zoom,
    parking_lat: body?.parking_lat,
    parking_lon: body?.parking_lon,
    parking_zoom: body?.parking_zoom,
    swell_sector_start_deg: body?.swell_sector_start_deg,
    swell_sector_end_deg: body?.swell_sector_end_deg,
    swell_main_deg: body?.swell_main_deg,
    wind_sector_start_deg: body?.wind_sector_start_deg,
    wind_sector_end_deg: body?.wind_sector_end_deg,
    wind_main_deg: body?.wind_main_deg,
  }
  const { data, error } = await supabaseAdmin.from('custom_surf_spots').update(patch).eq('id', id).eq('user_id', userId).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: Request) {
  const token = authToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  const userId = userData?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: any = await req.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabaseAdmin.from('custom_surf_spots').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
