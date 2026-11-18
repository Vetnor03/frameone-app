import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { BonnetidError, connectBonnetidForUser } from '@/app/lib/integrations/bonnetid/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const input = await req.json().catch(() => ({}))
  const cityId = String(input?.cityId ?? '')
  if (!/^\d{1,8}$/.test(cityId)) return NextResponse.json({ error: 'Select a city from the list.' }, { status: 400 })
  const asrMethod = Number(input?.asrMethod)
  if (asrMethod !== 1 && asrMethod !== 2) return NextResponse.json({ error: 'Select an Asr method (1x or 2x).' }, { status: 400 })
  try { return NextResponse.json(await connectBonnetidForUser(userId, cityId, asrMethod)) }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bønnetid unavailable', code: error instanceof BonnetidError ? error.code : 'unavailable' }, { status: error instanceof BonnetidError && error.code === 'invalid_city' ? 422 : 502 })
  }
}
