import { NextResponse } from 'next/server'
import { SURF_SPOTS } from '@/app/lib/surf/spots'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TODAYS_BEST_LABEL = "Today's Best"
const TODAYS_BEST_ID = '__todays_best__'

type SpotItem = {
  spotId: string
  label: string
}



async function fetchCustom(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return [] as SpotItem[]
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: userData } = await sb.auth.getUser(token)
  const userId = userData.user?.id
  if (!userId) return [] as SpotItem[]
  const { data } = await sb.from('user_custom_surf_spots').select('id,name').eq('user_id', userId)
  return (data || []).map((r:any)=>({ spotId: `custom:${r.id}`, label: `${String(r.name||'Custom spot')} · Custom` }))
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

export async function GET(req: Request) {
  try {
    const items: SpotItem[] = Object.values(SURF_SPOTS)
      .filter(Boolean)
      .map((s) => ({
        spotId: String(s.spotId || '').trim(),
        label: String(s.label || '').trim(),
      }))
      .filter((s) => s.spotId && s.label)

    const merged = [...items, ...(await fetchCustom(req))]
    const sorted = uniqItems(merged).sort((a, b) => a.label.localeCompare(b.label, 'nb'))

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