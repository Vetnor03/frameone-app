import { NextResponse } from 'next/server'
import { runEdgeOfNorwayShadowDiagnostic } from '@/app/lib/integrations/local-events/edge-of-norway-shadow'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

function diagnosticError(error: unknown) {
  const record = error as { name?: unknown; code?: unknown; message?: unknown }
  return {
    stage: 'authentication' as const,
    message: typeof record?.message === 'string' && record.message ? record.message : 'Local Events diagnostic failed',
    ...(typeof record?.name === 'string' ? { name: record.name } : {}),
    ...(typeof record?.code === 'string' ? { code: record.code } : {}),
  }
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.LOCAL_EVENTS_DIAGNOSTIC_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let userId: string | null
  try {
    userId = await getAuthenticatedUserId(req)
  } catch (error) {
    const details = diagnosticError(error)
    return NextResponse.json({ error: details.message, diagnosticError: details }, { status: 500 })
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized', diagnosticError: { stage: 'authentication', message: 'Unauthorized' } }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  return NextResponse.json(await runEdgeOfNorwayShadowDiagnostic(fetch, body?.areaPreference))
}
