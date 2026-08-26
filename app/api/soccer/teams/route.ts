// app/api/soccer/teams/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

import { ALL_TEAMS } from '@/app/lib/soccer/teams'

export async function GET(req: NextRequest) {
  const q = String(req.nextUrl.searchParams.get('q') || '').trim().toLowerCase()

  if (q.length < 2) {
    return NextResponse.json({ items: [] })
  }

  const items = ALL_TEAMS.filter((x) => {
    const hay = `${x.teamName} ${x.competitionName || ''}`.toLowerCase()
    return hay.includes(q)
  }).slice(0, 20)

  return NextResponse.json({ items })
}
