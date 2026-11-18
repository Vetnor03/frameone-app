import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { BonnetidError, getBonnetidCities } from '@/app/lib/integrations/bonnetid/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (!await getAuthenticatedUserId(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json({ cities: await getBonnetidCities() }) }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bønnetid unavailable', code: error instanceof BonnetidError ? error.code : 'unavailable' }, { status: error instanceof BonnetidError && error.code === 'setup_required' ? 503 : 502 })
  }
}
