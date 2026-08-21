import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeLayoutName, validateCustomGeometry } from '@/app/lib/customLayouts'

export const runtime = 'nodejs'
const tokenFor = (req: Request) => (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function context(req: Request, deviceId: string) {
  const client = db(), token = tokenFor(req)
  if (!token) return { error: NextResponse.json({ error: 'missing_auth_token' }, { status: 401 }) }
  const auth = await client.auth.getUser(token), userId = auth.data.user?.id
  if (!userId) return { error: NextResponse.json({ error: 'invalid_auth_token' }, { status: 401 }) }
  const member = await client.from('device_members').select('role').eq('device_id', deviceId).eq('user_id', userId).maybeSingle()
  if (member.error) return { error: NextResponse.json({ error: member.error.message }, { status: 500 }) }
  if (!member.data) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { client, userId }
}
const row = (value: any) => ({ id: value.id, deviceId: value.device_id, ownerUserId: value.owner_user_id, name: value.name, cells: value.cells, sortOrder: Number(value.sort_order), createdAt: value.created_at, updatedAt: value.updated_at })

export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get('device_id')?.trim() || ''
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  const ctx = await context(req, deviceId); if ('error' in ctx) return ctx.error
  const result = await ctx.client.from('custom_layouts').select('*').eq('device_id', deviceId).eq('owner_user_id', ctx.userId).order('sort_order').order('created_at')
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ layouts: (result.data || []).map(row) })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})), deviceId = String(body.deviceId || '').trim(), name = normalizeLayoutName(body.name)
  if (!deviceId || !name) return NextResponse.json({ error: !deviceId ? 'missing_device_id' : 'invalid_name' }, { status: 400 })
  const validation = validateCustomGeometry(body.cells, { requirePhysical: false })
  if (!validation.valid) return NextResponse.json({ error: 'invalid_geometry', details: validation }, { status: 400 })
  const ctx = await context(req, deviceId); if ('error' in ctx) return ctx.error
  const max = await ctx.client.from('custom_layouts').select('sort_order').eq('device_id', deviceId).eq('owner_user_id', ctx.userId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  if (max.error) return NextResponse.json({ error: max.error.message }, { status: 500 })
  const result = await ctx.client.from('custom_layouts').insert({ device_id: deviceId, owner_user_id: ctx.userId, name, cells: body.cells, sort_order: Number(max.data?.sort_order ?? -1) + 1 }).select('*').single()
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ layout: row(result.data) }, { status: 201 })
}
