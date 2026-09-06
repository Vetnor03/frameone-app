import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { affectedModulesSince } from '@/app/lib/device/contentRevision.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Intentionally limited to indexed ledger reads; no source/configuration fan-out.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const deviceId = deviceIdFrom(url.searchParams.get('device_id'))
  const since = Number(url.searchParams.get('since') ?? 0)
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  if (!Number.isSafeInteger(since) || since < 0) return NextResponse.json({ error: 'invalid_revision' }, { status: 400 })
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { data, error } = await auth.supabase.from('frame_content_revisions')
    .select('revision, changed_modules').eq('device_id', deviceId).maybeSingle()
  if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  const revision = Number(data?.revision ?? 0)
  const changed = revision > since
  let affectedModules: string[] = []
  if (changed) {
    const changes = await auth.supabase.from('frame_content_revision_changes')
      .select('revision, changed_modules').eq('device_id', deviceId).gt('revision', since).lte('revision', revision)
      .order('revision', { ascending: true })
    if (changes.error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    const rows = changes.data ?? []
    affectedModules = affectedModulesSince({ since, currentRevision: revision, changes: rows, fallback: data?.changed_modules ?? ['all'] })
  }
  return NextResponse.json({
    revision,
    changed,
    affected_modules: changed ? (affectedModules.length ? affectedModules : (data?.changed_modules ?? ['all'])) : [],
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
