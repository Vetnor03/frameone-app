import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeLayoutName, validateCustomGeometry } from '@/app/lib/customLayouts'

export const runtime = 'nodejs'
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function owner(req: Request, id: string) {
  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '', client = db()
  const auth = await client.auth.getUser(token), userId = auth.data.user?.id
  if (!userId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const found = await client.from('custom_layouts').select('*').eq('id', id).eq('owner_user_id', userId).maybeSingle()
  if (found.error) return { error: NextResponse.json({ error: found.error.message }, { status: 500 }) }
  if (!found.data) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  const member = await client.from('device_members').select('role').eq('device_id', found.data.device_id).eq('user_id', userId).maybeSingle()
  if (!member.data) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  return { client, userId, found: found.data }
}
const map = (v: any) => ({ id:v.id, deviceId:v.device_id, ownerUserId:v.owner_user_id, name:v.name, cells:v.cells, sortOrder:Number(v.sort_order), createdAt:v.created_at, updatedAt:v.updated_at })

export async function PATCH(req: Request, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params, body = await req.json().catch(() => ({})), ctx = await owner(req, id); if ('error' in ctx) return ctx.error
  const changes: Record<string, unknown> = {}
  if ('name' in body) { const name = normalizeLayoutName(body.name); if (!name) return NextResponse.json({error:'invalid_name'}, {status:400}); changes.name = name }
  if ('cells' in body) { const validation = validateCustomGeometry(body.cells, {requirePhysical:true}); if (!validation.valid) return NextResponse.json({error:'invalid_geometry', details:validation}, {status:400}); changes.cells = body.cells }
  const result = await ctx.client.from('custom_layouts').update(changes).eq('id', id).eq('owner_user_id', ctx.userId).select('*').single()
  if (result.error) return NextResponse.json({error:result.error.message}, {status:500})
  return NextResponse.json({layout:map(result.data)})
}
export async function POST(req: Request, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params, ctx = await owner(req, id); if ('error' in ctx) return ctx.error
  const following = await ctx.client.from('custom_layouts').select('id,sort_order').eq('device_id',ctx.found.device_id).eq('owner_user_id',ctx.userId).gt('sort_order',ctx.found.sort_order).order('sort_order')
  for (const item of [...(following.data || [])].reverse()) await ctx.client.from('custom_layouts').update({sort_order:Number(item.sort_order)+1}).eq('id',item.id)
  const result = await ctx.client.from('custom_layouts').insert({device_id:ctx.found.device_id,owner_user_id:ctx.userId,name:`${ctx.found.name} copy`.slice(0,40),cells:ctx.found.cells,sort_order:Number(ctx.found.sort_order)+1}).select('*').single()
  if (result.error) return NextResponse.json({error:result.error.message},{status:500})
  return NextResponse.json({layout:map(result.data)}, {status:201})
}
export async function DELETE(req: Request, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params, ctx = await owner(req, id); if ('error' in ctx) return ctx.error
  const result = await ctx.client.from('custom_layouts').delete().eq('id',id).eq('owner_user_id',ctx.userId)
  if (result.error) return NextResponse.json({error:result.error.message},{status:500})
  return NextResponse.json({ok:true})
}
