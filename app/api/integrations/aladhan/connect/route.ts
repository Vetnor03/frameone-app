import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { AladhanIntegrationError, connectAladhanForUser } from '@/app/lib/integrations/aladhan/server'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const config = await req.json().catch(() => ({}))
  try { return NextResponse.json(await connectAladhanForUser(userId, config)) }
  catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not connect AlAdhan',
      code: error instanceof AladhanIntegrationError ? error.code : 'unavailable',
    }, { status: error instanceof AladhanIntegrationError && error.code === 'invalid_configuration' ? 400 : 502 })
  }
}
