import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isProductEvent, safeAnalyticsMetadata } from '@/app/lib/productAnalytics.mjs'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !isProductEvent(body.event) || typeof body.sessionId !== 'string' || !body.sessionId || body.sessionId.length > 80) return NextResponse.json({ ok: false }, { status: 400 })
  const { error } = await db.rpc('record_product_analytics_event', {
    p_event_name: body.event, p_session_id: body.sessionId,
    p_client_id: typeof body.clientInstallId === 'string' ? body.clientInstallId : null,
    p_frame_device_id: typeof body.frameDeviceId === 'string' ? body.frameDeviceId : null,
    p_surface: typeof body.surface === 'string' ? body.surface : null,
    p_source: body.source === 'manual' || body.source === 'assistant' ? body.source : null,
    p_metadata: safeAnalyticsMetadata(body.metadata),
  })
  return NextResponse.json({ ok: !error }, { status: error ? 400 : 202 })
}
