// app/api/soccer/frame/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { TEAM_ID_MAP } from '@/app/lib/soccer/teamIdMap'

export const runtime = 'nodejs'

const API_KEY = process.env.FOOTBALL_DATA_API_KEY
const SOCCER_FETCH_TIMEOUT_MS = 8000
const SOCCER_DATA_REVALIDATE_SECONDS = 5 * 60
const SOCCER_STALE_SECONDS = 24 * 60 * 60

type SoccerLogContext = Record<string, unknown>

class SoccerExternalApiError extends Error {
  status: number
  debugReason: string

  constructor(message: string, status: number, debugReason: string) {
    super(message)
    this.name = 'SoccerExternalApiError'
    this.status = status
    this.debugReason = debugReason
  }
}

function soccerLog(stage: string, context: SoccerLogContext = {}) {
  console.info('[soccer-frame]', { stage, ...context })
}

function soccerError(stage: string, context: SoccerLogContext = {}) {
  console.error('[soccer-frame]', { stage, ...context })
}

function soccerJson(payload: unknown, status = 200, cacheable = false) {
  const body = JSON.stringify(payload)
  const cacheControl = cacheable
    ? `public, s-maxage=${SOCCER_DATA_REVALIDATE_SECONDS}, stale-while-revalidate=${SOCCER_STALE_SECONDS}`
    : 'no-store'

  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // The ESP32 HTTP client is much more reliable when it can reserve the
      // response buffer up front instead of growing a chunked String in RAM.
      'Content-Length': String(new TextEncoder().encode(body).byteLength),
      'Cache-Control': cacheControl,
      'Vercel-CDN-Cache-Control': cacheControl,
    },
  })
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e || 'Unknown error')
}

function emptyFramePayload(args: { teamKey: string; teamId: number; domesticCompetitionCode: string | null; competitionName?: string | null }) {
  return {
    teamKey: args.teamKey,
    teamId: args.teamId,
    domesticCompetitionCode: args.domesticCompetitionCode,
    competitionName: args.competitionName ?? null,
    next: null,
    last: null,
    standing: null,
    table: [],
    lastScorers: [],
    topScorer: null,
    nextLineup: buildNextLineupStub(),
    empty: true,
  }
}

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

const fetchJson = unstable_cache(async (
  url: string,
  stage: string,
  extraHeaders?: Record<string, string>
) => {
  if (!API_KEY) {
    soccerError('config:missing-api-key', { stage, envVar: 'FOOTBALL_DATA_API_KEY' })
    throw new SoccerExternalApiError('Football data API key is not configured', 502, 'missing FOOTBALL_DATA_API_KEY')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SOCCER_FETCH_TIMEOUT_MS)
  const startedAt = Date.now()
  soccerLog('external-fetch:start', { stage, url })

  try {
    const res = await fetch(url, {
      headers: {
        'X-Auth-Token': API_KEY,
        ...(extraHeaders || {}),
      },
      // Cache the parsed successful value via unstable_cache below. Keeping the
      // origin request itself uncached ensures a 429/5xx response is never saved.
      cache: 'no-store',
      signal: controller.signal,
    })
    const durationMs = Date.now() - startedAt

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const debugReason = text || `football-data returned HTTP ${res.status}`
      soccerError('external-fetch:http-error', { stage, status: res.status, durationMs, debugReason })
      throw new SoccerExternalApiError('Football data API request failed', res.status, debugReason)
    }

    const json = await res.json()
    soccerLog('external-fetch:parsed', { stage, status: res.status, durationMs, keys: json && typeof json === 'object' ? Object.keys(json).slice(0, 10) : [] })
    return json
  } catch (e: unknown) {
    const durationMs = Date.now() - startedAt
    if (e instanceof SoccerExternalApiError) throw e
    const isAbort = e instanceof Error && e.name === 'AbortError'
    const debugReason = isAbort ? `football-data request timed out after ${SOCCER_FETCH_TIMEOUT_MS}ms` : errorMessage(e)
    soccerError('external-fetch:network-error', { stage, durationMs, debugReason })
    throw new SoccerExternalApiError('Football data API request failed', 502, debugReason)
  } finally {
    clearTimeout(timeout)
  }
}, ['soccer-football-data-v1'], { revalidate: SOCCER_DATA_REVALIDATE_SECONDS })

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID()
  const rawTeamKey = req.nextUrl.searchParams.get('teamId')
  const teamKey = String(rawTeamKey || '').trim().toLowerCase()
  soccerLog('request:start', { requestId, rawTeamId: rawTeamKey, teamKey, apiKeyConfigured: Boolean(API_KEY) })

  if (!teamKey) {
    soccerError('teamId:invalid', { requestId, rawTeamId: rawTeamKey, reason: 'missing' })
    return soccerJson({ error: 'Missing teamId', code: 'missing_team_id' }, 400)
  }

  const teamId = TEAM_ID_MAP[teamKey]
  soccerLog('teamId:parsed', { requestId, teamKey, teamId: teamId ?? null })
  if (!teamId) {
    soccerError('teamId:unsupported', { requestId, teamKey, supportedTeamIds: Object.keys(TEAM_ID_MAP) })
    return soccerJson({ error: `Unsupported teamId: ${teamKey}`, code: 'unsupported_team_id', teamId: teamKey }, 400)
  }

  const domesticCompetitionCode = DOMESTIC_COMPETITION_MAP[teamKey] || null
  soccerLog('team:resolved', { requestId, teamKey, teamId, domesticCompetitionCode })

  try {
    const today = new Date()
    const pastFrom = new Date(today)
    pastFrom.setDate(pastFrom.getDate() - 90)

    const futureTo = new Date(today)
    futureTo.setDate(futureTo.getDate() + 90)

    const [nextData, lastData] = await Promise.all([
      fetchJson(
        `https://api.football-data.org/v4/teams/${teamId}/matches?status=SCHEDULED&dateFrom=${ymdUtc(today)}&dateTo=${ymdUtc(futureTo)}&limit=3`,
        'next-matches'
      ),
      fetchJson(
        `https://api.football-data.org/v4/teams/${teamId}/matches?status=FINISHED&dateFrom=${ymdUtc(pastFrom)}&dateTo=${ymdUtc(today)}&limit=3`,
        'last-matches',
        { 'X-Unfold-Goals': 'true' }
      ),
    ])

    const nextMatches = Array.isArray(nextData?.matches) ? nextData.matches : []
    const lastMatches = Array.isArray(lastData?.matches) ? lastData.matches : []

    soccerLog('matches:parsed', { requestId, nextCount: nextMatches.length, lastCount: lastMatches.length })

    const nextMatch = nextMatches[0] || null
    const prevMatch = lastMatches[lastMatches.length - 1] || null

    let standing = null
    let topScorer = null
    let competitionName: string | null = null
    let table: any[] = []

    if (domesticCompetitionCode) {
      try {
        const [standingsData, scorersData] = await Promise.all([
          fetchJson(`https://api.football-data.org/v4/competitions/${domesticCompetitionCode}/standings`, 'standings'),
          fetchJson(`https://api.football-data.org/v4/competitions/${domesticCompetitionCode}/scorers?limit=20`, 'scorers'),
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
      } catch (e: unknown) {
        soccerError('competition:optional-data-failed', { requestId, teamKey, domesticCompetitionCode, reason: errorMessage(e) })
        standing = null
        topScorer = null
        competitionName = null
        table = []
      }
    }

    const lastScorers = prevMatch ? extractTeamScorersFromMatch(prevMatch, teamId) : []

    // ✅ NEW lineup
    const nextLineup = buildNextLineupStub()

    const payload = {
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
      empty: !nextMatch && !prevMatch && !standing && table.length === 0 && !topScorer,
    }
    soccerLog('response:payload', { requestId, teamKey, teamId, empty: payload.empty, hasNext: Boolean(payload.next), hasLast: Boolean(payload.last), tableRows: payload.table.length })
    return soccerJson(payload, 200, true)
  } catch (e: unknown) {
    const debugReason = e instanceof SoccerExternalApiError ? e.debugReason : errorMessage(e)
    soccerError('request:failed', { requestId, teamKey, teamId, reason: debugReason, name: e instanceof Error ? e.name : typeof e })

    if (e instanceof SoccerExternalApiError) {
      return soccerJson(
        { error: 'External soccer API failed', code: 'external_soccer_api_failed', debugReason },
        502
      )
    }

    return soccerJson(emptyFramePayload({ teamKey, teamId, domesticCompetitionCode }))
  }
}
