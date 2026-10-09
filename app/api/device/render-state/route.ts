import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { buildFrameConfigPayload } from '@/app/api/device/frame-config/builder'
import frameLayouts from '@/shared/frame-layouts.json'
import { collectVisibleContent, contentDigest, physicalNewsSnapshot, physicalRenderManifest, withPhysicalCellGeometry } from '@/app/lib/device/contentSignature.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// This is deliberately the second-stage, potentially expensive request. The
// firmware calls it only for affected/due modules or a manual screen-wide check.
export async function GET(req: Request) {
  const startedAtMs = Date.now()
  const url = new URL(req.url)
  const deviceId = deviceIdFrom(url.searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const authMs = Date.now() - startedAtMs
  const configStartedAtMs = Date.now()
  const config = await buildFrameConfigPayload(auth.supabase, deviceId)
  const configMs = Date.now() - configStartedAtMs
  if ('pair_required' in config || 'setup_pending' in config) return NextResponse.json(config, { status: 409 })
  const settings = withPhysicalCellGeometry(config.settings_json, frameLayouts.layouts)
  const requested = new Set((url.searchParams.get('modules') ?? 'all').split(',').map((x) => x.trim()).filter(Boolean))
  const refreshModules = new Set((url.searchParams.get('refresh_modules') ?? '').split(',').map((x) => x.trim()).filter(Boolean))
  const selectedSettings = requested.has('all') ? settings : {
    ...settings,
    cells: settings.cells.filter((cell: Record<string, unknown>) => {
      const key = String(cell.module ?? '').toLowerCase()
      return requested.has(key) || requested.has(key.split(':')[0])
    }),
  }
  const sourcesStartedAtMs = Date.now()
  const visible = await collectVisibleContent({
    settings: selectedSettings,
    deviceId,
    origin: url.origin,
    authorization: req.headers.get('authorization') ?? '',
    refreshModules,
  })
  const sourcesMs = Date.now() - sourcesStartedAtMs
  const manifestStartedAtMs = Date.now()
  const renderSources = { ...visible.sources, date: visible.time.date ?? null }
  const modules = physicalRenderManifest({ settings: selectedSettings, sources: renderSources })
    .filter((module) => requested.has('all') || requested.has(module.key) || requested.has(module.key.split(':')[0]))
    .map((module) => {
      if (module.key !== 'news') return module
      // The ESP32 must paint the same headlines this render hash describes.
      // A second independent RSS request can race a feed change, fail, or
      // reuse a retained older snapshot while the new hash gets committed.
      return { ...module, news_snapshot: physicalNewsSnapshot(visible.sources.news) }
    })
  const layoutHash = contentDigest({ layout: settings.layout, theme: settings.theme, cells: settings.cells })
  console.info('[device/render-state] timing', {
    device_id: deviceId,
    request_kind: requested.has('all') ? 'all' : 'selective',
    auth_ms: authMs,
    config_ms: configMs,
    sources_ms: sourcesMs,
    manifest_ms: Date.now() - manifestStartedAtMs,
    total_ms: Date.now() - startedAtMs,
    module_count: modules.length,
    // No user content or raw module payloads: enough detail to diagnose
    // redundant source checks versus genuinely different display hashes.
    module_keys: modules.map((module) => module.key),
    scheduled_refresh_keys: [...refreshModules],
    next_deadlines: modules.map((module) => ({
      key: module.key,
      deadlines: module.deadlines.map(({ at, type, reason }) => ({ at, type, reason })),
    })),
  })
  return NextResponse.json({ layout_hash: layoutHash, modules },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
