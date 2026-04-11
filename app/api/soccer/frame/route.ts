// app/api/soccer/frame/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { TEAM_ID_MAP } from '@/app/lib/soccer/teamIdMap'

export const runtime = 'nodejs'

const API_KEY = process.env.FOOTBALL_DATA_API_KEY!

const DOMESTIC_COMPETITION_MAP: Record<string, string> = {
  arsenal: 'PL',
  man_utd: 'PL',
  man_city: 'PL',
  liverpool: 'PL',
  chelsea: 'PL',
  tottenham: 'PL',
  newcastle: 'PL',
  aston_villa: 'PL',
  brighton: 'PL',
  west_ham: 'PL',

  real_madrid: 'PD',
  barcelona: 'PD',
  atletico_madrid: 'PD',
  real_sociedad: 'PD',
  sevilla: 'PD',

  bayern: 'BL1',
  dortmund: 'BL1',
  leipzig: 'BL1',
  leverkusen: 'BL1',

  juventus: 'SA',
  inter: 'SA',
  ac_milan: 'SA',
  napoli: 'SA',
  roma: 'SA',

  psg: 'FL1',
  marseille: 'FL1',
  lyon: 'FL1',

  ajax: 'DED',
  porto: 'PPL',
  benfica: 'PPL',
  sporting: 'PPL',
}

function ymdUtc(d: Date) {
  return d.toISOString().slice(0, 10)
}

function compactName(name: string) {
  return String(name || '')
    .replace(/\s+FC$/i, '')
    .replace(/\s+CF$/i, '')
    .replace(/\s+FK$/i, '')
    .trim()
}

function compactTableShortName(row: any) {
  const tla = String(row?.team?.tla || '').trim()
  if (tla) return tla

  const short =
    row?.team?.shortName ||
    row?.team?.name ||
    ''

  return compactName(String(short || ''))
}

function formatMatch(m: any, teamId: number) {
  if (!m) return null

  return {
    utc: m.utcDate,
    home: m.homeTeam?.name || '',
    away: m.awayTeam?.name || '',
    homeShort: compactName(m.homeTeam?.shortName || m.homeTeam?.name || ''),
    awayShort: compactName(m.awayTeam?.shortName || m.awayTeam?.name || ''),
    isHome: m.homeTeam?.id === teamId,
    score:
      m.score?.fullTime && (m.score.fullTime.home != null || m.score.fullTime.away != null)
        ? `${m.score.fullTime.home ?? '-'}-${m.score.fullTime.away ?? '-'}`
        : null,
    status: m.status,
    competition: m.competition?.name || '',
    competitionCode: m.competition?.code || '',
    matchday: m.matchday ?? null,
    venue: m.venue ?? null,
  }
}

function extractTeamScorersFromMatch(match: any, teamId: number) {
  const goals = Array.isArray(match?.goals) ? match.goals : []
  const out: Array<{ name: string; minute?: number | null }> = []

  for (const g of goals) {
    const scorerName = String(g?.scorer?.name || g?.person?.name || '').trim()
    const scorerTeamId = Number(
      g?.team?.id ??
      g?.scorerTeam?.id ??
      g?.teamId ??
      g?.team?.team?.id ??
      NaN
    )
    const minute = Number.isFinite(Number(g?.minute)) ? Number(g.minute) : null

    if (!scorerName) continue
    if (!Number.isFinite(scorerTeamId)) continue
    if (scorerTeamId !== teamId) continue

    out.push({ name: scorerName, minute })
  }

  return out
}

function normalizeForm(form: string | null | undefined) {
  const raw = String(form || '').trim()
  if (!raw) return []
  return raw.split(',').map((x) => x.trim()).filter(Boolean)
}

function buildStanding(table: any[], teamId: number) {
  if (!Array.isArray(table) || !table.length) return null

  const idx = table.findIndex((row) => Number(row?.team?.id) === teamId)
  if (idx < 0) return null

  const row = table[idx]
  const above = idx > 0 ? table[idx - 1] : null
  const below = idx < table.length - 1 ? table[idx + 1] : null

  return {
    position: row?.position ?? null,
    points: row?.points ?? null,
    played: row?.playedGames ?? null,
    won: row?.won ?? null,
    draw: row?.draw ?? null,
    lost: row?.lost ?? null,
    goalsFor: row?.goalsFor ?? null,
    goalsAgainst: row?.goalsAgainst ?? null,
    goalDifference: row?.goalDifference ?? null,
    form: normalizeForm(row?.form),
    gapAbove:
      above && Number.isFinite(Number(above?.points)) && Number.isFinite(Number(row?.points))
        ? Number(above.points) - Number(row.points)
        : null,
    gapBelow:
      below && Number.isFinite(Number(row?.points)) && Number.isFinite(Number(below?.points))
        ? Number(row.points) - Number(below.points)
        : null,
    teamAbove: above?.team?.name || null,
    teamBelow: below?.team?.name || null,
  }
}

function buildTableRows(table: any[], teamId: number) {
  if (!Array.isArray(table) || !table.length) return []

  const selectedRow = table.find((row) => Number(row?.team?.id) === teamId)
  const selectedPoints =
    selectedRow && Number.isFinite(Number(selectedRow?.points))
      ? Number(selectedRow.points)
      : null

  return table.map((row) => {
    const points = Number.isFinite(Number(row?.points)) ? Number(row.points) : null
    const isSelected = Number(row?.team?.id) === teamId

    return {
      position: Number.isFinite(Number(row?.position)) ? Number(row.position) : null,
      teamId: Number.isFinite(Number(row?.team?.id)) ? Number(row.team.id) : null,
      teamName: row?.team?.name || '',
      teamShort: compactTableShortName(row),
      points,
      goalDifference:
        Number.isFinite(Number(row?.goalDifference)) ? Number(row.goalDifference) : null,
      gap:
        selectedPoints != null && points != null
          ? points - selectedPoints
          : null,
      isSelected,
    }
  })
}

function pickTopScorerForTeam(scorers: any[], teamId: number) {
  if (!Array.isArray(scorers) || !scorers.length) return null

  const hit = scorers.find((s) => Number(s?.team?.id) === teamId)
  if (!hit) return null

  return {
    name: hit?.player?.name || '',
    goals: hit?.goals ?? null,
    assists: hit?.assists ?? null,
    penalties: hit?.penalties ?? null,
  }
}

// ✅ NEW: lineup stub
function buildNextLineupStub() {
  return {
    status: 'none', // "predicted" | "confirmed" | "none"
    formation: null,
    goalkeeper: [],
    defenders: [],
    midfielders: [],
    attackers: [],
    bench: [],
  }
}

async function fetchJson(url: string, extraHeaders?: Record<string, string>) {
  const res = await fetch(url, {
    headers: {
      'X-Auth-Token': API_KEY,
      ...(extraHeaders || {}),
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed (${res.status})`)
  }

  return res.json()
}

export async function GET(req: NextRequest) {
  const teamKey = String(req.nextUrl.searchParams.get('teamId') || '').trim()

  if (!teamKey) {
    return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  }

  const teamId = TEAM_ID_MAP[teamKey]
  if (!teamId) {
    return NextResponse.json({ error: 'Unknown team' }, { status: 400 })
  }

  const domesticCompetitionCode = DOMESTIC_COMPETITION_MAP[teamKey] || null

  try {
    const today = new Date()
    const pastFrom = new Date(today)
    pastFrom.setDate(pastFrom.getDate() - 90)

    const futureTo = new Date(today)
    futureTo.setDate(futureTo.getDate() + 90)

    const [nextData, lastData] = await Promise.all([
      fetchJson(
        `https://api.football-data.org/v4/teams/${teamId}/matches?status=SCHEDULED&dateFrom=${ymdUtc(today)}&dateTo=${ymdUtc(futureTo)}&limit=3`
      ),
      fetchJson(
        `https://api.football-data.org/v4/teams/${teamId}/matches?status=FINISHED&dateFrom=${ymdUtc(pastFrom)}&dateTo=${ymdUtc(today)}&limit=3`,
        { 'X-Unfold-Goals': 'true' }
      ),
    ])

    const nextMatches = Array.isArray(nextData?.matches) ? nextData.matches : []
    const lastMatches = Array.isArray(lastData?.matches) ? lastData.matches : []

    const nextMatch = nextMatches[0] || null
    const prevMatch = lastMatches[lastMatches.length - 1] || null

    let standing = null
    let topScorer = null
    let competitionName: string | null = null
    let table: any[] = []

    if (domesticCompetitionCode) {
      try {
        const [standingsData, scorersData] = await Promise.all([
          fetchJson(`https://api.football-data.org/v4/competitions/${domesticCompetitionCode}/standings`),
          fetchJson(`https://api.football-data.org/v4/competitions/${domesticCompetitionCode}/scorers?limit=20`),
        ])

        competitionName = standingsData?.competition?.name || null

        const standingsList = Array.isArray(standingsData?.standings) ? standingsData.standings : []
        const totalStanding =
          standingsList.find((s: any) => s?.type === 'TOTAL') ||
          standingsList[0] ||
          null

        const rawTable = Array.isArray(totalStanding?.table) ? totalStanding.table : []
        standing = buildStanding(rawTable, teamId)
        table = buildTableRows(rawTable, teamId)

        const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : []
        topScorer = pickTopScorerForTeam(scorers, teamId)
      } catch {
        standing = null
        topScorer = null
        competitionName = null
        table = []
      }
    }

    const lastScorers = prevMatch ? extractTeamScorersFromMatch(prevMatch, teamId) : []

    // ✅ NEW lineup
    const nextLineup = buildNextLineupStub()

    return NextResponse.json({
      teamKey,
      teamId,
      domesticCompetitionCode,
      competitionName,
      next: formatMatch(nextMatch, teamId),
      last: formatMatch(prevMatch, teamId),
      standing,
      table,
      lastScorers,
      topScorer,

      // ✅ NEW
      nextLineup,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}