import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { authenticatePhysicalDevice, deviceIdFrom } from '@/app/lib/device/updateStateAuth'
import { buildFrameConfigPayload } from '@/app/api/device/frame-config/builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type JsonRecord = Record<string, unknown>
const VOLATILE_KEYS = new Set(['updated_at', 'requested_at', 'fetched_at', 'fetch_timestamp', 'request_id', 'last_probe_at', 'http_timing'])

function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {} }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .filter(([key]) => !VOLATILE_KEYS.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, stable(child)]))
}

function activeModules(settings: JsonRecord) {
  return new Set((Array.isArray(settings.cells) ? settings.cells : [])
    .map((cell) => String(record(cell).module ?? '').split(':')[0].toLowerCase())
    .filter(Boolean))
}

async function fetchVisibleJson(url: URL, authorization: string) {
  const response = await fetch(url, { headers: { authorization }, cache: 'no-store' })
  if (!response.ok) throw new Error(`content_source_${response.status}`)
  return stable(await response.json())
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const deviceId = deviceIdFrom(requestUrl.searchParams.get('device_id'))
  if (!deviceId) return NextResponse.json({ error: 'missing_device_id' }, { status: 400 })
  const auth = await authenticatePhysicalDevice(req, deviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const config = await buildFrameConfigPayload(auth.supabase, deviceId)
    if ('pair_required' in config) return NextResponse.json({ error: 'pair_required' }, { status: 409 })
    const settings = record(config.settings_json)
    const modules = record(settings.modules)
    const active = activeModules(settings)
    const authorization = req.headers.get('authorization') || ''
    const sources: JsonRecord = { config: stable(settings), active: [...active].sort() }

    // Visible local date and deliberate four-hour selection window are inputs,
    // unlike transport/fetch timestamps which stable() removes.
    const oslo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (active.has('date')) sources.date = { oslo_date: oslo }
    if (active.has('assistant')) sources.rotation_window = Math.floor(Date.now() / (4 * 60 * 60 * 1000))

    const calls: Promise<void>[] = []
    const add = (name: string, url: URL) => calls.push(fetchVisibleJson(url, authorization).then((json) => { sources[name] = json }))
    if (active.has('reminders')) add('reminders', new URL(`/api/device/reminders?device_id=${encodeURIComponent(deviceId)}&limit=10&tz=Europe%2FOslo&skip_sync=1`, requestUrl.origin))
    if (active.has('countdown')) add('countdown', new URL(`/api/device/countdowns?device_id=${encodeURIComponent(deviceId)}`, requestUrl.origin))
    if (active.has('stocks')) add('stocks', new URL(`/api/device/stocks?device_id=${encodeURIComponent(deviceId)}`, requestUrl.origin))
    if (active.has('groceries')) add('groceries', new URL(`/api/device/groceries?device_id=${encodeURIComponent(deviceId)}`, requestUrl.origin))
    if (active.has('assistant')) add('assistant', new URL(`/api/device/assistant?device_id=${encodeURIComponent(deviceId)}`, requestUrl.origin))

    if (active.has('weather')) for (const item of Array.isArray(modules.weather) ? modules.weather : []) {
      const weather = record(item); const id = String(weather.id ?? '1')
      add(`weather:${id}`, new URL(`/api/weather/details?frame=1&compact=2&days=5&lat=${encodeURIComponent(String(weather.lat ?? 59.9139))}&lon=${encodeURIComponent(String(weather.lon ?? 10.7522))}`, requestUrl.origin))
    }
    if (active.has('soccer')) for (const item of Array.isArray(modules.soccer) ? modules.soccer : []) {
      const soccer = record(item); const id = String(soccer.id ?? '1')
      add(`soccer:${id}`, new URL(`/api/soccer/frame?teamId=${encodeURIComponent(String(soccer.teamId ?? soccer.team_id ?? ''))}`, requestUrl.origin))
    }
    if (active.has('surf')) for (const item of Array.isArray(modules.surf) ? modules.surf : []) {
      const surf = record(item); const id = String(surf.id ?? '1')
      add(`surf:${id}`, new URL(`/api/device/surf-meta?device_id=${encodeURIComponent(deviceId)}&spotId=${encodeURIComponent(String(surf.spotId ?? ''))}&spot=${encodeURIComponent(String(surf.spot ?? 'Surf'))}&hours=4`, requestUrl.origin))
    }
    await Promise.all(calls)
    const signature = createHash('sha256').update(JSON.stringify(stable(sources))).digest('hex')
    return NextResponse.json({ signature }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    console.error('content signature failed', { deviceId, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'content_signature_unavailable' }, { status: 503 })
  }
}
