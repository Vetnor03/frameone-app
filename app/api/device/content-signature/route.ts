import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { buildFrameConfigPayload } from '@/app/api/device/frame-config/builder'
import frameLayouts from '@/shared/frame-layouts.json'
import { collectVisibleContent, contentDigest, withPhysicalCellGeometry } from '@/app/lib/device/contentSignature.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const deviceId = deviceIdFrom(requestUrl.searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const config = await buildFrameConfigPayload(auth.supabase, deviceId)
    if ('pair_required' in config) return NextResponse.json({ error: 'pair_required' }, { status: 409 })
    if ('setup_pending' in config) return NextResponse.json({ error: 'setup_pending' }, { status: 409 })
    const visible = await collectVisibleContent({
      settings: withPhysicalCellGeometry(config.settings_json, frameLayouts.layouts),
      deviceId,
      origin: requestUrl.origin,
      authorization: req.headers.get('authorization') || '',
    })
    return NextResponse.json(
      { signature: contentDigest(visible) },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('content signature failed', { deviceId, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'content_signature_unavailable' }, { status: 503 })
  }
}
