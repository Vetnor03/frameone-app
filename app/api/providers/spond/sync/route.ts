import { NextResponse } from 'next/server'
import { createUserServerClient } from '../../../../lib/serverAuth'
import { syncSpondForUser } from '../../../../lib/providers/spondSync'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const { user, authError } = await createUserServerClient()
    if (!user) return NextResponse.json({ ok: false, error: authError ?? 'unauthorized' }, { status: 401 })

    const result = await syncSpondForUser(user.id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
