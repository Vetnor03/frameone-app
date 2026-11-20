import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
import { GOOGLE_TASKS_PROVIDER } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await disconnectIntegrationForUser(userId, GOOGLE_TASKS_PROVIDER)) }
  catch { return NextResponse.json({ error: 'Could not disconnect Google Tasks' }, { status: 500 }) }
}
