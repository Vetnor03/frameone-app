import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type DeleteStep = { step: string; error: string }

function bearerFromRequest(req: Request) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || ''
}

function isOwnerRole(role: unknown) {
  return String(role ?? '').trim().toLowerCase() === 'owner'
}

async function deleteByDeviceId(supabase: SupabaseClient, table: string, deviceId: string, errors: DeleteStep[]) {
  const { error } = await supabase.from(table).delete().eq('device_id', deviceId)
  if (error) errors.push({ step: `delete_${table}`, error: error.message })
}

async function resetDevicePairingState(supabase: SupabaseClient, deviceId: string, errors: DeleteStep[]) {
  const { data: deviceRow, error: readError } = await supabase
    .from('devices')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle()

  if (readError) {
    errors.push({ step: 'read_devices', error: readError.message })
    return false
  }

  if (!deviceRow || typeof deviceRow !== 'object') {
    errors.push({ step: 'read_devices', error: 'device_not_found' })
    return false
  }

  const row = deviceRow as Record<string, unknown>
  const resetValues: Record<string, unknown> = {
    owner_id: null,
    user_id: null,
    device_token: null,
    device_token_hash: null,
    paired: false,
    paired_at: null,
    pair_code: null,
    pair_code_expires_at: null,
    updated_at: new Date().toISOString(),
  }

  const patch = Object.fromEntries(Object.entries(resetValues).filter(([column]) => column in row))

  if (Object.keys(patch).length === 0) {
    errors.push({ step: 'reset_devices', error: 'no_supported_reset_columns' })
    return false
  }

  const { error } = await supabase.from('devices').update(patch).eq('device_id', deviceId)
  if (error) {
    errors.push({ step: 'reset_devices', error: error.message })
    return false
  }

  return true
}

export async function POST(req: Request) {
  const errors: DeleteStep[] = []

  try {
    const token = bearerFromRequest(req)
    if (!token) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as { device_id?: unknown } | null
    const deviceId = String(body?.device_id ?? '').trim()
    if (!deviceId) return NextResponse.json({ ok: false, error: 'missing_device_id' }, { status: 400 })

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
    if (!member.data) return NextResponse.json({ ok: false, error: 'frame_not_found' }, { status: 404 })

    if (!isOwnerRole(member.data.role)) {
      const remove = await supabase
        .from('device_members')
        .delete()
        .eq('device_id', deviceId)
        .eq('user_id', userId)

      if (remove.error) return NextResponse.json({ ok: false, error: remove.error.message }, { status: 500 })
      return NextResponse.json({ ok: true, reset: false })
    }

    await deleteByDeviceId(supabase, 'device_settings', deviceId, errors)
    await deleteByDeviceId(supabase, 'device_status', deviceId, errors)
    await deleteByDeviceId(supabase, 'device_members', deviceId, errors)

    const reset = await resetDevicePairingState(supabase, deviceId, errors)
    if (!reset) {
      return NextResponse.json({ ok: false, error: 'device_reset_failed', details: errors }, { status: 500 })
    }

    return NextResponse.json({ ok: true, reset: true, warnings: errors })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
