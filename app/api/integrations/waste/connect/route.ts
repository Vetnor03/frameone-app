import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { connectWasteForUser, previewWasteForUser } from '@/app/lib/integrations/waste/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const address = typeof body?.address === 'string' ? body.address.trim() : (body?.address && typeof body.address === 'object' ? body.address : '')
    if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })
    const result = body?.preview === true ? await previewWasteForUser(userId, address) : await connectWasteForUser(userId, address)
    return NextResponse.json(result, { status: result.status === 'unsupported' ? 202 : 200 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to connect waste collection' }, { status: 500 })
  }
}
