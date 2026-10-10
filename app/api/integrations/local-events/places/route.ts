import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'

export const runtime = 'nodejs'

type Place = { id: string; label: string; latitude: number; longitude: number }
type KartverketName = { skrivemåte?: string }
type KartverketEntry = {
  stedsnavn?: KartverketName | KartverketName[]
  skrivemåte?: string
  representasjonspunkt?: { nord?: number; øst?: number; ost?: number; lat?: number; lon?: number }
  stednummer?: number
  stedsnummer?: number
  kommuner?: Array<{ kommunenavn?: string; navn?: string }>
}

export function parseKartverketPlaces(payload: unknown): Place[] {
  const response = payload as { navn?: KartverketEntry[] } | null
  const places = Array.isArray(response?.navn) ? response.navn : []
  const used = new Set<string>()
  const result: Place[] = []
  for (const entry of places) {
    const names = entry.stedsnavn
    const spelling = (Array.isArray(names)
      ? names.find((name) => typeof name?.skrivemåte === 'string')?.skrivemåte
      : names?.skrivemåte) || entry.skrivemåte
    const location = entry?.representasjonspunkt
    const latitude = Number(location?.nord ?? location?.lat)
    const longitude = Number(location?.øst ?? location?.ost ?? location?.lon)
    const stednummer = Number(entry?.stednummer ?? entry?.stedsnummer)
    if (!spelling || !Number.isInteger(stednummer) || stednummer <= 0 ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < 57 || latitude > 81 || longitude < -11 || longitude > 36) continue
    const id = 'ssr:' + stednummer
    if (used.has(id)) continue
    used.add(id)
    const municipality = entry?.kommuner?.[0]?.kommunenavn || entry?.kommuner?.[0]?.navn || ''
    result.push({ id, label: municipality ? `${spelling}, ${municipality}` : spelling, latitude, longitude })
  }
  return result
}

export async function GET(request: Request) {
  if (!await getAuthenticatedUserId(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const query = new URL(request.url).searchParams.get('q')?.trim() || ''
  if (query.length < 2 || query.length > 60 || /[<>]/.test(query)) return NextResponse.json({ places: [] })
  const url = new URL('https://ws.geonorge.no/stedsnavn/v1/navn')
  url.searchParams.set('sok', query.replace(/[?*]/g, '') + '*')
  url.searchParams.set('koordsys', '4326')
  url.searchParams.set('treffPerSide', '40')
  url.searchParams.set('side', '1')
  try {
    const response = await fetch(url.toString(), { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error('Place search unavailable')
    return NextResponse.json({ places: parseKartverketPlaces(await response.json()) })
  } catch {
    return NextResponse.json({ error: 'Could not search places right now.', places: [] }, { status: 502 })
  }
}
