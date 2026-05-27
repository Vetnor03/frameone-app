import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function summarizeSurfFuelPenaltyFromSettings(settingsJson: unknown) {
  const modules = settingsJson && typeof settingsJson === 'object' ? (settingsJson as Record<string, unknown>).modules : null
  const surf = modules && typeof modules === 'object' ? (modules as Record<string, unknown>).surf : null
  const surfList = Array.isArray(surf) ? surf : []
  return surfList.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const fp = row.fuelPenalty
    const fpObj = fp && typeof fp === 'object' && !Array.isArray(fp) ? (fp as Record<string, unknown>) : null
    const num = (v: unknown) => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }
    const text = (v: unknown) => {
      const t = String(v ?? '').trim()
      return t ? t : null
    }
    return {
      index,
      id: num(row.id),
      fuelPenaltyExists: !!fpObj,
      enabled: fpObj ? Boolean(fpObj.enabled) : null,
      homeAddress: fpObj ? text(fpObj.homeAddress) : null,
      formatted: fpObj ? text(fpObj.formatted) : null,
      homeLat: fpObj ? num(fpObj.homeLat) : null,
      homeLon: fpObj ? num(fpObj.homeLon) : null,
      distanceKm: fpObj ? num(fpObj.distanceKm) : null,
      fuelLiters: fpObj ? num(fpObj.fuelLiters) : null,
      fuelPrice: fpObj ? num(fpObj.fuelPrice) : null,
    }
  })
}

function bearerFromRequest(req: Request) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || ''
}

export async function POST(req: Request) {
  try {
    const token = bearerFromRequest(req)
    if (!token) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as { device_id?: unknown; settings_json?: unknown } | null
    const deviceId = String(body?.device_id ?? '').trim()
    const settingsJson = body?.settings_json

    if (!deviceId) return NextResponse.json({ ok: false, error: 'missing_device_id' }, { status: 400 })
    if (!settingsJson || typeof settingsJson !== 'object' || Array.isArray(settingsJson)) {
      return NextResponse.json({ ok: false, error: 'invalid_settings_json' }, { status: 400 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const auth = await supabase.auth.getUser(token)
    const userId = auth.data.user?.id
    if (!userId) return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })

    const member = await supabase
      .from('device_members')
      .select('role')
      .eq('device_id', deviceId)
      .eq('user_id', userId)
      .maybeSingle()
    if (member.error) return NextResponse.json({ ok: false, error: member.error.message }, { status: 500 })
    if (!member.data) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    console.info('[SURF][FUEL_PENALTY] save-settings-received', { deviceId, surfFuelPenalty: summarizeSurfFuelPenaltyFromSettings(settingsJson) })

    const existing = await supabase
      .from('device_settings')
      .select('device_id')
      .eq('device_id', deviceId)
      .maybeSingle()
    if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 })

    const save = existing.data
      ? await supabase
          .from('device_settings')
          .update({ settings_json: settingsJson })
          .eq('device_id', deviceId)
          .select('updated_at')
          .maybeSingle()
      : await supabase
          .from('device_settings')
          .insert({ device_id: deviceId, settings_json: settingsJson })
          .select('updated_at')
          .maybeSingle()

    if (save.error) return NextResponse.json({ ok: false, error: save.error.message }, { status: 500 })

    const persisted = await supabase
      .from('device_settings')
      .select('settings_json')
      .eq('device_id', deviceId)
      .maybeSingle()

    console.info('[SURF][FUEL_PENALTY] save-settings-after-write', {
      deviceId,
      readbackError: persisted.error?.message ?? null,
      surfFuelPenalty: summarizeSurfFuelPenaltyFromSettings(persisted.data?.settings_json),
    })

    return NextResponse.json({
      ok: true,
      storage: { table: 'device_settings', key: `device_id=${deviceId}` },
      updated_at: save.data?.updated_at ?? null,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
