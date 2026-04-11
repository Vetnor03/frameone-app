import { NextResponse } from 'next/server'
import { SURF_SPOTS } from '@/app/lib/surf/spots'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TODAYS_BEST_LABEL = "Today's Best"
const TODAYS_BEST_ID = '__todays_best__'

type SpotItem = {
  spotId: string
  label: string
}

function uniqItems(list: SpotItem[]) {
  const seen = new Set<string>()
  const out: SpotItem[] = []

  for (const item of list) {
    const spotId = String(item?.spotId ?? '').trim()
    const label = String(item?.label ?? '').trim()
    if (!spotId || !label) continue

    const key = spotId.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ spotId, label })
  }

  return out
}

export async function GET() {
  try {
    const items: SpotItem[] = Object.values(SURF_SPOTS)
      .filter(Boolean)
      .map((s) => ({
        spotId: String(s.spotId || '').trim(),
        label: String(s.label || '').trim(),
      }))
      .filter((s) => s.spotId && s.label)

    const sorted = uniqItems(items).sort((a, b) => a.label.localeCompare(b.label, 'nb'))

    const cleaned = [
      { spotId: TODAYS_BEST_ID, label: TODAYS_BEST_LABEL },
      ...sorted.filter((x) => x.spotId !== TODAYS_BEST_ID),
    ]

    return NextResponse.json(
      {
        spots: cleaned.map((x) => x.label),
        items: cleaned,
        todays_best: { id: TODAYS_BEST_ID, label: TODAYS_BEST_LABEL },
      },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  } catch (e: any) {
    return NextResponse.json(
      { spots: [], items: [], error: String(e?.message || e) },
      { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    )
  }
}