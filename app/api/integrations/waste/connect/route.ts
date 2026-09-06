import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { connectWasteForUser, previewWasteAddress } from '@/app/lib/integrations/waste/server'
import type { WasteAddress } from '@/app/lib/integrations/waste/providers'
import { WasteProviderError } from '@/app/lib/integrations/waste/providers'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const address = body?.address as WasteAddress
    if (!address?.addressId || !address?.municipalityNumber) return NextResponse.json({ error: 'Select an address from the search results.' }, { status: 400 })
    const result = body?.preview === true ? await previewWasteAddress(address, body?.language === 'no' ? 'no' : 'en') : await connectWasteForUser(userId, address)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const providerError = error instanceof WasteProviderError ? error : null
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to connect waste collection', code: providerError?.code, retryable: providerError?.retryable ?? true }, { status: providerError?.code === 'unsupported' ? 422 : 502 })
  }
}
