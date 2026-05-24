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
