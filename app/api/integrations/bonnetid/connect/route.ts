import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { BonnetidError, connectBonnetidForUser } from '@/app/lib/integrations/bonnetid/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const input = await req.json().catch(() => ({}))
  const cityId = String(input?.cityId ?? '').toUpperCase()
  if (!/^NO[0-9]{4}$/.test(cityId)) return NextResponse.json({ error: 'Velg lokasjon fra listen.' }, { status: 400 })
  try { return NextResponse.json(await connectBonnetidForUser(userId, cityId)) }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'IRN utilgjengelig', code: error instanceof BonnetidError ? error.code : 'unavailable' }, { status: error instanceof BonnetidError && error.code === 'invalid_city' ? 422 : 502 })
  }
}
