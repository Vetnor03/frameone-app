import { NextResponse } from 'next/server'
import { GET as getBaseMirrorSnapshot } from './base'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function skiId(value: unknown) {
  const match = String(value ?? '').trim().toLowerCase().match(/^ski(?::(\d+))?$/)
  if (!match) return null
  const id = Number(match[1] || '1')
  return Number.isInteger(id) && id >= 1 && id <= 255 ? id : null
}

function metric(value: unknown, suffix: string) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number)} ${suffix}` : `-- ${suffix}`
}

function temperature(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number)}`.replace('-', '−') + '°' : '--°'
}

function windDirection(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const normalized = ((number % 360) + 360) % 360
  return labels[Math.round(normalized / 45) % labels.length]
}

function skiDetail(source: UnknownRecord) {
  const location = record(source.location)
  const current = record(source.current)
  const snow = record(source.snow)
  const avalanche = record(source.avalanche)
  const danger = Number(avalanche.danger_level)
  const assessed = avalanche.assessed === true && Number.isFinite(danger) && danger > 0
  const avalancheLine = assessed
    ? `⚠ Avalanche ${Math.round(danger)}`
    : avalanche.available === true || danger === 0
      ? '⚠ Avalanche · Not assessed'
      : 'Avalanche unavailable'
  const wind = `${windDirection(current.wind_dir_deg)} ${metric(current.wind_mps, 'm/s')}`

  return {
    module: 'ski',
    primary: String(location.label || 'Ski').trim().toLocaleUpperCase('en-US'),
    secondary: `${metric(snow.fresh_24h_cm, 'cm fresh')} · ${metric(snow.snow_depth_cm, 'cm total')}`,
    tertiary: `${temperature(current.temp_c)} · ${wind} · ${avalancheLine}`,
  }
}

export async function GET(req: Request) {
  const baseResponse = await getBaseMirrorSnapshot(req)
  if (!baseResponse.ok) return baseResponse

  const payload = await baseResponse.json().catch(() => null)
  if (!payload || typeof payload !== 'object') return baseResponse

  const data = payload as UnknownRecord
  const settings = record(data.settings_json)
  const cells = Array.isArray(settings.cells) ? settings.cells.map(record) : []
  const skiCells = cells.flatMap((cell) => {
    const slot = Number(cell.slot)
    const id = skiId(cell.module)
    return Number.isFinite(slot) && id != null ? [{ slot, id }] : []
  })
  if (skiCells.length === 0) return NextResponse.json(data, { status: baseResponse.status })

  const deviceId = String(data.device_id || '').trim()
  const authorization = req.headers.get('authorization') || ''
  const detailsBySlot = { ...record(data.detailsBySlot) }

  await Promise.all(skiCells.map(async ({ slot, id }) => {
    try {
      const endpoint = new URL('/api/device/ski-frame', req.url)
      endpoint.searchParams.set('device_id', deviceId)
      endpoint.searchParams.set('id', String(id))
      const response = await fetch(endpoint, { cache: 'no-store', headers: { authorization } })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body || typeof body !== 'object') throw new Error(`ski_frame_${response.status}`)
      detailsBySlot[String(slot)] = skiDetail(body as UnknownRecord)
    } catch (error: unknown) {
      console.error('[mirror-snapshot:ski-detail-failed]', { slot, id, reason: error instanceof Error ? error.message : String(error) })
      detailsBySlot[String(slot)] = { module: 'ski', primary: 'SKI', secondary: 'Temporarily unavailable' }
    }
  }))

  return NextResponse.json({ ...data, detailsBySlot }, { status: baseResponse.status })
}
