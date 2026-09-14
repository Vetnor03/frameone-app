from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

route_path = Path('app/api/ski/summary/route.ts')
route = route_path.read_text()

route = replace_once(
    route,
    "const NVE_GTS_BASE = 'https://gts.nve.no/api/GridTimeSeries'\n",
    "const NVE_GTS_BASE = 'https://gts.nve.no/api/GridTimeSeries'\nconst VARSOM_API_BASE = 'https://api01.nve.no/hydrology/forecast/avalanche/v6.3.2/api'\nconst VARSOM_WARNING_URL = 'https://www.varsom.no/snoskred/varsling/'\n",
    'Varsom constants',
)

varsom_helpers = r'''function avalancheDangerName(level: number | null, language: 'no' | 'en') {
  const namesNo: Record<number, string> = {
    0: 'Ikke vurdert',
    1: 'Liten',
    2: 'Moderat',
    3: 'Betydelig',
    4: 'Stor',
    5: 'Meget stor',
  }
  const namesEn: Record<number, string> = {
    0: 'Not assessed',
    1: 'Low',
    2: 'Moderate',
    3: 'Considerable',
    4: 'High',
    5: 'Very high',
  }
  if (level == null) return null
  return (language === 'no' ? namesNo : namesEn)[level] ?? null
}

function avalancheAspects(value: unknown, language: 'no' | 'en') {
  const mask = String(value || '').trim()
  if (!/^[01]{8}$/.test(mask)) return []
  const labels = language === 'no'
    ? ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV']
    : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return labels.filter((_, index) => mask[index] === '1')
}

function avalancheElevationLabel(problem: any, language: 'no' | 'en') {
  const height1 = finiteNumber(problem?.ExposedHeight1)
  const height2 = finiteNumber(problem?.ExposedHeight2)
  const fill = finiteNumber(problem?.ExposedHeightFill)
  const valid1 = height1 != null && height1 > 0 ? Math.round(height1) : null
  const valid2 = height2 != null && height2 > 0 ? Math.round(height2) : null

  if (valid1 == null && valid2 == null) return null
  if (fill === 1 && valid1 != null) return language === 'no' ? `Over ${valid1} m` : `Above ${valid1} m`
  if (fill === 2 && valid1 != null) return language === 'no' ? `Under ${valid1} m` : `Below ${valid1} m`

  if (valid1 != null && valid2 != null && valid1 !== valid2) {
    const low = Math.min(valid1, valid2)
    const high = Math.max(valid1, valid2)
    if (fill === 3) {
      return language === 'no' ? `Under ${low} m eller over ${high} m` : `Below ${low} m or above ${high} m`
    }
    if (fill === 4) {
      return language === 'no' ? `${low}–${high} m` : `${low}–${high} m`
    }
    return `${low}–${high} m`
  }

  const height = valid1 ?? valid2
  return height == null ? null : `${height} m`
}

function unavailableAvalanche(language: 'no' | 'en') {
  return {
    available: false,
    assessed: false,
    danger_level: null as number | null,
    danger_name: null as string | null,
    region_name: null as string | null,
    valid_from: null as string | null,
    main_text: null as string | null,
    problems: [] as Array<{
      name: string | null
      aspects: string[]
      elevation: string | null
      trigger: string | null
      size: string | null
    }>,
    full_warning_url: VARSOM_WARNING_URL,
    attribution: 'Varsler fra Snøskredvarslingen i Norge og www.varsom.no',
    language,
  }
}

async function loadVarsomAvalanche(latitude: number, longitude: number, language: 'no' | 'en') {
  const today = osloParts(new Date()).date
  const langKey = language === 'no' ? 1 : 2
  const url = `${VARSOM_API_BASE}/Warning/Coordinate/${latitude}/${longitude}/${langKey}/${today}/${today}`

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return unavailableAvalanche(language)

    const payload = await response.json().catch(() => null)
    const warning = Array.isArray(payload) ? payload[0] ?? null : null
    if (!warning) return unavailableAvalanche(language)

    const dangerLevel = finiteNumber(warning?.DangerLevel)
    const rawProblems = Array.isArray(warning?.AvalancheProblems) ? warning.AvalancheProblems : []
    const problems = rawProblems.map((problem: any) => ({
      name: String(problem?.AvalancheProblemTypeName || problem?.AvalancheExtName || '').trim() || null,
      aspects: avalancheAspects(problem?.ValidExpositions, language),
      elevation: avalancheElevationLabel(problem, language),
      trigger: String(problem?.AvalTriggerSimpleName || problem?.AvalTriggerSensitivityName || '').trim() || null,
      size: String(problem?.DestructiveSizeExtName || '').trim() || null,
    }))

    return {
      available: true,
      assessed: dangerLevel != null && dangerLevel > 0,
      danger_level: dangerLevel,
      danger_name: avalancheDangerName(dangerLevel, language),
      region_name: String(warning?.RegionName || '').trim() || null,
      valid_from: String(warning?.ValidFrom || '').trim() || null,
      main_text: String(warning?.MainText || '').trim() || null,
      problems,
      full_warning_url: VARSOM_WARNING_URL,
      attribution: 'Varsler fra Snøskredvarslingen i Norge og www.varsom.no',
      language,
    }
  } catch {
    return unavailableAvalanche(language)
  }
}

'''

route = replace_once(route, 'function compactForecast(timeseries: any[]) {\n', varsom_helpers + 'function compactForecast(timeseries: any[]) {\n', 'Varsom helpers')
route = replace_once(
    route,
    "  const label = String(searchParams.get('label') || '').trim().slice(0, 120)\n",
    "  const label = String(searchParams.get('label') || '').trim().slice(0, 120)\n  const language: 'no' | 'en' = searchParams.get('lang') === 'no' ? 'no' : 'en'\n",
    'language query',
)
route = replace_once(
    route,
    '  const snowPromise = loadSeNorgeSnow(lat, lon)\n',
    '  const snowPromise = loadSeNorgeSnow(lat, lon)\n  const avalanchePromise = loadVarsomAvalanche(lat, lon, language)\n',
    'avalanche promise',
)
route = replace_once(
    route,
    '  const snow = await snowPromise\n',
    '  const [snow, avalanche] = await Promise.all([snowPromise, avalanchePromise])\n',
    'await avalanche',
)
route = replace_once(route, '    snow,\n    forecast:', '    snow,\n    avalanche,\n    forecast:', 'avalanche response')
route = replace_once(
    route,
    "      snow: 'NVE SeNorge',\n",
    "      snow: 'NVE SeNorge',\n      avalanche: 'Varsom / Snøskredvarslingen i Norge',\n",
    'avalanche source',
)
route_path.write_text(route)

home_path = Path('app/HomePageClient.tsx')
home = home_path.read_text()

snow_type = '''  snow: {
    snow_depth_cm: number | null
    fresh_24h_cm: number | null
    fresh_72h_cm: number | null
    altitude_m: number | null
    source_date: string | null
    grid: { x: number; y: number }
  }
'''
avalanche_type = snow_type + '''  avalanche: {
    available: boolean
    assessed: boolean
    danger_level: number | null
    danger_name: string | null
    region_name: string | null
    valid_from: string | null
    main_text: string | null
    problems: Array<{
      name: string | null
      aspects: string[]
      elevation: string | null
      trigger: string | null
      size: string | null
    }>
    full_warning_url: string
    attribution: string
  }
'''
home = replace_once(home, snow_type, avalanche_type, 'client avalanche type')
home = replace_once(
    home,
    "      label: locationLabel,\n    })",
    "      label: locationLabel,\n      lang: language,\n    })",
    'client language param',
)
home = replace_once(
    home,
    '  }, [hasCoordinates, lat, lon, locationLabel])\n',
    '  }, [hasCoordinates, lat, lon, locationLabel, language])\n',
    'client language dependency',
)
home = replace_once(
    home,
    '  const snow = summary?.snow ?? null\n',
    '  const snow = summary?.snow ?? null\n  const avalanche = summary?.avalanche ?? null\n',
    'client avalanche state',
)

source_footer = '                <div className="mt-5 text-[11px] text-[color:var(--fg-40)]">NVE SeNorge · MET Norway</div>\n'
avalanche_ui = '''                <div className="mt-6 border-t border-[color:var(--bd-10)] pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">{isNo ? 'SNØSKRED' : 'AVALANCHE'}</div>
                      {avalanche?.region_name ? (
                        <div className="mt-1 text-xs text-[color:var(--fg-45)]">{avalanche.region_name}</div>
                      ) : null}
                    </div>
                    <a
                      href={avalanche?.full_warning_url || 'https://www.varsom.no/snoskred/varsling/'}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-[color:var(--fg-55)] underline underline-offset-4"
                    >
                      Varsom.no ↗
                    </a>
                  </div>

                  {!avalanche?.available ? (
                    <div className="mt-3 text-base text-[color:var(--fg-60)]">{isNo ? 'Data ikke tilgjengelig' : 'Data unavailable'}</div>
                  ) : avalanche.danger_level === 0 || !avalanche.assessed ? (
                    <div className="mt-3 text-xl font-semibold text-[color:var(--fg-90)]">{isNo ? 'Ikke vurdert' : 'Not assessed'}</div>
                  ) : (
                    <>
                      <div className="mt-3 text-xl font-semibold text-[color:var(--fg-95)]">
                        ⚠ {isNo ? 'Faregrad' : 'Danger'} {avalanche.danger_level} · {avalanche.danger_name}
                      </div>
                      {avalanche.problems?.length ? (
                        <div className="mt-4 space-y-3">
                          {avalanche.problems.map((problem, index) => {
                            const terrain = [
                              problem.aspects?.length ? problem.aspects.join(' · ') : null,
                              problem.elevation,
                            ].filter(Boolean).join(' · ')
                            return (
                              <div key={`${problem.name || 'problem'}-${index}`}>
                                <div className="text-sm font-medium text-[color:var(--fg-85)]">{problem.name || (isNo ? 'Skredproblem' : 'Avalanche problem')}</div>
                                {terrain ? <div className="mt-0.5 text-xs leading-5 text-[color:var(--fg-50)]">{terrain}</div> : null}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </>
                  )}

                  {avalanche?.attribution ? (
                    <div className="mt-4 text-[10px] leading-4 text-[color:var(--fg-35)]">{avalanche.attribution}</div>
                  ) : null}
                </div>
                <div className="mt-5 text-[11px] text-[color:var(--fg-40)]">NVE SeNorge · MET Norway</div>
'''
home = replace_once(home, source_footer, avalanche_ui, 'avalanche UI')
home_path.write_text(home)

print('Applied Varsom avalanche backend + Ski UI patch')
