import { NextResponse } from 'next/server'
import { runEdgeOfNorwayShadowDiagnostic } from '@/app/lib/integrations/local-events/edge-of-norway-shadow'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

function diagnosticErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'Local Events diagnostic failed'
}

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return NextResponse.json(await runEdgeOfNorwayShadowDiagnostic())
  } catch (error: unknown) {
    return NextResponse.json({
      provider: 'edge-of-norway',
      mode: 'shadow',
      source: 'Stavanger',
      detailPagesFetched: 0,
      acceptedCount: 0,
      skippedCounts: {},
      fetchErrors: [diagnosticErrorMessage(error)],
      error: diagnosticErrorMessage(error),
    }, { status: 200 })
  }
}
