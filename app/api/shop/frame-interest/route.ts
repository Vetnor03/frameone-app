import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { shopFrames } from '../../../shop/productData'

const visitorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const frame = shopFrames.find((item) => item.id === body?.frameId && item.availability === 'coming-soon')
  if (!frame || typeof body?.visitorId !== 'string' || !visitorPattern.test(body.visitorId) || typeof body?.favourite !== 'boolean') {
    return NextResponse.json({ error: 'Invalid frame interest request.' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ saved: false }, { status: 202 })

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const query = body.favourite
    ? supabase.from('shop_frame_interest').upsert({ frame_id: frame.id, visitor_id: body.visitorId }, { onConflict: 'frame_id,visitor_id', ignoreDuplicates: true })
    : supabase.from('shop_frame_interest').delete().eq('frame_id', frame.id).eq('visitor_id', body.visitorId)
  const { error } = await query
  if (error) return NextResponse.json({ error: 'Unable to save frame interest.' }, { status: 503 })
  return NextResponse.json({ saved: true })
}
