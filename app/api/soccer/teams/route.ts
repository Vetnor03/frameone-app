// app/api/soccer/teams/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type SoccerTeamItem = {
  teamId: string
  teamName: string
  competitionId?: string
  competitionName?: string
}

const ALL_TEAMS: SoccerTeamItem[] = [
  // 🇬🇧 Premier League
  { teamId: 'arsenal', teamName: 'Arsenal', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'man_utd', teamName: 'Manchester United', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'man_city', teamName: 'Manchester City', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'liverpool', teamName: 'Liverpool', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'chelsea', teamName: 'Chelsea', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'tottenham', teamName: 'Tottenham', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'newcastle', teamName: 'Newcastle', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'aston_villa', teamName: 'Aston Villa', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'brighton', teamName: 'Brighton', competitionId: 'PL', competitionName: 'Premier League' },
  { teamId: 'west_ham', teamName: 'West Ham', competitionId: 'PL', competitionName: 'Premier League' },

  // 🇪🇸 La Liga
  { teamId: 'real_madrid', teamName: 'Real Madrid', competitionId: 'LL', competitionName: 'La Liga' },
  { teamId: 'barcelona', teamName: 'Barcelona', competitionId: 'LL', competitionName: 'La Liga' },
  { teamId: 'atletico_madrid', teamName: 'Atletico Madrid', competitionId: 'LL', competitionName: 'La Liga' },
  { teamId: 'real_sociedad', teamName: 'Real Sociedad', competitionId: 'LL', competitionName: 'La Liga' },
  { teamId: 'sevilla', teamName: 'Sevilla', competitionId: 'LL', competitionName: 'La Liga' },

  // 🇩🇪 Bundesliga
  { teamId: 'bayern', teamName: 'Bayern Munich', competitionId: 'BL', competitionName: 'Bundesliga' },
  { teamId: 'dortmund', teamName: 'Borussia Dortmund', competitionId: 'BL', competitionName: 'Bundesliga' },
  { teamId: 'leipzig', teamName: 'RB Leipzig', competitionId: 'BL', competitionName: 'Bundesliga' },
  { teamId: 'leverkusen', teamName: 'Bayer Leverkusen', competitionId: 'BL', competitionName: 'Bundesliga' },

  // 🇮🇹 Serie A
  { teamId: 'juventus', teamName: 'Juventus', competitionId: 'SA', competitionName: 'Serie A' },
  { teamId: 'inter', teamName: 'Inter', competitionId: 'SA', competitionName: 'Serie A' },
  { teamId: 'ac_milan', teamName: 'AC Milan', competitionId: 'SA', competitionName: 'Serie A' },
  { teamId: 'napoli', teamName: 'Napoli', competitionId: 'SA', competitionName: 'Serie A' },
  { teamId: 'roma', teamName: 'AS Roma', competitionId: 'SA', competitionName: 'Serie A' },

  // 🇫🇷 Ligue 1
  { teamId: 'psg', teamName: 'PSG', competitionId: 'L1', competitionName: 'Ligue 1' },
  { teamId: 'marseille', teamName: 'Marseille', competitionId: 'L1', competitionName: 'Ligue 1' },
  { teamId: 'lyon', teamName: 'Lyon', competitionId: 'L1', competitionName: 'Ligue 1' },

  // 🌍 Other big clubs
  { teamId: 'ajax', teamName: 'Ajax', competitionId: 'ERED', competitionName: 'Eredivisie' },
  { teamId: 'porto', teamName: 'Porto', competitionId: 'LP', competitionName: 'Liga Portugal' },
  { teamId: 'benfica', teamName: 'Benfica', competitionId: 'LP', competitionName: 'Liga Portugal' },
  { teamId: 'sporting', teamName: 'Sporting CP', competitionId: 'LP', competitionName: 'Liga Portugal' },

  // 🇳🇴 Norway (important for your users)
  { teamId: 'brann', teamName: 'Brann', competitionId: 'EL', competitionName: 'Eliteserien' },
  { teamId: 'bodo_glimt', teamName: 'Bodø/Glimt', competitionId: 'EL', competitionName: 'Eliteserien' },
  { teamId: 'molde', teamName: 'Molde', competitionId: 'EL', competitionName: 'Eliteserien' },
  { teamId: 'viking', teamName: 'Viking FK', competitionId: 'EL', competitionName: 'Eliteserien' },
  { teamId: 'rosenborg', teamName: 'Rosenborg', competitionId: 'EL', competitionName: 'Eliteserien' },
  { teamId: 'fredrikstad', teamName: 'Fredrikstad', competitionId: 'EL', competitionName: 'Eliteserien' },
]

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