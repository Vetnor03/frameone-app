import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { buildFrameConfigPayload } from '@/app/api/device/frame-config/builder'
import frameLayouts from '@/shared/frame-layouts.json'
import { collectVisibleContent, contentDigest, physicalRenderManifest, withPhysicalCellGeometry } from '@/app/lib/device/contentSignature.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// This is deliberately the second-stage, potentially expensive request. The
// firmware calls it only for affected/due modules or a manual screen-wide check.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const deviceId = deviceIdFrom(url.searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const config = await buildFrameConfigPayload(auth.supabase, deviceId)
  if ('pair_required' in config || 'setup_pending' in config) return NextResponse.json(config, { status: 409 })
  const settings = withPhysicalCellGeometry(config.settings_json, frameLayouts.layouts)
  const requested = new Set((url.searchParams.get('modules') ?? 'all').split(',').map((x) => x.trim()).filter(Boolean))
  const selectedSettings = requested.has('all') ? settings : {
    ...settings,
    cells: settings.cells.filter((cell: Record<string, unknown>) => {
      const key = String(cell.module ?? '').toLowerCase()
      return requested.has(key) || requested.has(key.split(':')[0])
    }),
  }
  const visible = await collectVisibleContent({ settings: selectedSettings, deviceId, origin: url.origin, authorization: req.headers.get('authorization') ?? '' })
  const renderSources = { ...visible.sources, date: visible.time.date ?? null }
  const modules = physicalRenderManifest({ settings: selectedSettings, sources: renderSources })
    .filter((module) => requested.has('all') || requested.has(module.key) || requested.has(module.key.split(':')[0]))
  const layoutHash = contentDigest({ layout: settings.layout, theme: settings.theme, cells: settings.cells })
  return NextResponse.json({ layout_hash: layoutHash, modules },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
