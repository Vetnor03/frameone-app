import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type ResetStepResult = {
  step: string
  error: string | null
}

const DEVICE_RESET_TABLES = ['device_settings', 'device_status'] as const

function bearerFromRequest(req: Request) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || ''
}

async function deleteByDeviceId(supabase: SupabaseClient, table: string, deviceId: string): Promise<ResetStepResult> {
  const { error } = await supabase.from(table).delete().eq('device_id', deviceId)
  return { step: `delete_${table}`, error: error?.message ?? null }
}

async function clearDeviceIdentity(supabase: SupabaseClient, deviceId: string): Promise<ResetStepResult> {
  const updatedAt = new Date().toISOString()
  const resetPayloads: Record<string, unknown>[] = [
    {
      device_token: null,
      device_token_hash: null,
      owner_id: null,
      user_id: null,
      pair_code: null,
      pair_code_expires_at: null,
      paired_at: null,
      claimed_at: null,
      updated_at: updatedAt,
    },
    { device_token: null, owner_id: null, user_id: null, pair_code: null, pair_code_expires_at: null, updated_at: updatedAt },
    { device_token: null, owner_id: null, pair_code: null, pair_code_expires_at: null, updated_at: updatedAt },
    { device_token: null, user_id: null, pair_code: null, pair_code_expires_at: null, updated_at: updatedAt },
    { device_token: null, updated_at: updatedAt },
    { device_token: null },
  ]

  let lastError: string | null = null
  for (const payload of resetPayloads) {
    const { error } = await supabase.from('devices').update(payload).eq('device_id', deviceId)
    if (!error) return { step: 'clear_devices_pairing_state', error: null }
    lastError = error.message
  }

  return { step: 'clear_devices_pairing_state', error: lastError }
}

async function resetFrameToUnpaired(supabase: SupabaseClient, deviceId: string) {
  const results: ResetStepResult[] = []

  results.push(await clearDeviceIdentity(supabase, deviceId))

  for (const table of DEVICE_RESET_TABLES) {
    results.push(await deleteByDeviceId(supabase, table, deviceId))
  }

  const memberDelete = await supabase.from('device_members').delete().eq('device_id', deviceId)
  results.push({ step: 'delete_device_members', error: memberDelete.error?.message ?? null })

  return results
}

export async function POST(req: Request) {
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
    if (member.data.role !== 'owner') return NextResponse.json({ ok: false, error: 'owner_required' }, { status: 403 })

    const resetResults = await resetFrameToUnpaired(supabase, deviceId)
    const resetError = resetResults.find((result) => result.error)
    if (resetError) {
      return NextResponse.json(
        { ok: false, error: resetError.error, failed_step: resetError.step, reset_results: resetResults },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, reset_results: resetResults })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
