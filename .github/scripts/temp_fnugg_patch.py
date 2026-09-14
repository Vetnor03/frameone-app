from pathlib import Path

route_path = Path("app/api/ski/summary/route.ts")
route = route_path.read_text()

anchor = "const VARSOM_WARNING_URL = 'https://www.varsom.no/snoskred/varsling/'\n"
insert = """const VARSOM_WARNING_URL = 'https://www.varsom.no/snoskred/varsling/'
const FNUGG_API_BASE = 'https://api.fnugg.no'
const FNUGG_SITE_BASE = 'https://fnugg.no'
"""
assert anchor in route, "route constants anchor missing"
route = route.replace(anchor, insert, 1)

anchor = "\nfunction compactForecast(timeseries: any[]) {\n"
fnugg_code = r"""
function unavailableFnuggResort() {
  return {
    available: false,
    id: null as number | null,
    name: null as string | null,
    distance_km: null as number | null,
    resort_open: false,
    ski_open: false,
    lift_only: false,
    lifts_open: null as number | null,
    lifts_total: null as number | null,
    slopes_open: null as number | null,
    slopes_total: null as number | null,
    today_hours: null as { closed: boolean; from: string | null; to: string | null } | null,
    url: null as string | null,
    last_updated: null as string | null,
  }
}

function osloWeekdayKey(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OSLO_TIMEZONE,
    weekday: 'long',
  }).format(value).toLowerCase()
}

function fnuggTodayHours(openingHours: any) {
  if (!openingHours || typeof openingHours !== 'object') return null

  const now = new Date()
  const today = osloParts(now).date
  const exceptions = Array.isArray(openingHours?.exception_days) ? openingHours.exception_days : []
  const exception = exceptions.find((entry: any) => String(entry?.date || '').slice(0, 10) === today)
  const regular = openingHours?.[osloWeekdayKey(now)]
  const hours = exception ?? regular

  if (!hours || typeof hours !== 'object') return null

  return {
    closed: Boolean(hours.closed),
    from: String(hours.from || '').trim() || null,
    to: String(hours.to || '').trim() || null,
  }
}

function fnuggCount(value: unknown) {
  const number = finiteNumber(value)
  return number == null ? null : Math.max(0, Math.round(number))
}

function isFnuggWinterResortCandidate(source: any) {
  const name = String(source?.name || '').trim()
  if (!name || /(sommer|summer|bike)/i.test(name)) return false

  const lifts = fnuggCount(source?.lifts?.count) ?? 0
  const slopes = fnuggCount(source?.slopes?.count) ?? 0
  return lifts >= 2 || slopes >= 2
}

async function loadFnuggResort(latitude: number, longitude: number) {
  const url = new URL(`${FNUGG_API_BASE}/geodata/getnearest`)
  url.searchParams.set('lat', String(latitude))
  url.searchParams.set('lon', String(longitude))
  url.searchParams.set('distance', '30')
  url.searchParams.set(
    'sourceFields',
    'id,name,site_path,location,resort_open,resort_opening_date,resort_closing_date,opening_hours,lifts,slopes,last_updated'
  )

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return unavailableFnuggResort()

    const payload = await response.json().catch(() => null)
    const hits = Array.isArray(payload?.hits?.hits) ? payload.hits.hits : []
    const candidate = hits.find((hit: any) => isFnuggWinterResortCandidate(hit?._source))
    if (!candidate?._source) return unavailableFnuggResort()

    const source = candidate._source
    const id = fnuggCount(source?.id)
    const name = String(source?.name || '').trim() || null
    if (id == null || !name) return unavailableFnuggResort()

    const liftsOpen = fnuggCount(source?.lifts?.open)
    const liftsTotal = fnuggCount(source?.lifts?.count)
    const slopesOpen = fnuggCount(source?.slopes?.open)
    const slopesTotal = fnuggCount(source?.slopes?.count)
    const resortOpen = Boolean(source?.resort_open)
    const skiOpen = resortOpen && (slopesOpen ?? 0) > 0
    const liftOnly = resortOpen && !skiOpen && (liftsOpen ?? 0) > 0
    const sitePath = String(source?.site_path || '').trim()
    const distanceM = finiteNumber(Array.isArray(candidate?.sort) ? candidate.sort[0] : null)

    return {
      available: true,
      id,
      name,
      distance_km: distanceM == null ? null : round1(distanceM / 1000),
      resort_open: resortOpen,
      ski_open: skiOpen,
      lift_only: liftOnly,
      lifts_open: liftsOpen,
      lifts_total: liftsTotal,
      slopes_open: slopesOpen,
      slopes_total: slopesTotal,
      today_hours: fnuggTodayHours(source?.opening_hours),
      url: sitePath.startsWith('/') ? `${FNUGG_SITE_BASE}${sitePath}` : FNUGG_SITE_BASE,
      last_updated: String(source?.last_updated || '').trim() || null,
    }
  } catch {
    return unavailableFnuggResort()
  }
}

"""
assert anchor in route, "compactForecast anchor missing"
route = route.replace(anchor, "\n" + fnugg_code + "function compactForecast(timeseries: any[]) {\n", 1)

anchor = "  const avalanchePromise = loadVarsomAvalanche(lat, lon, language)\n"
replacement = anchor + "  const resortPromise = loadFnuggResort(lat, lon)\n"
assert anchor in route, "avalanche promise anchor missing"
route = route.replace(anchor, replacement, 1)

anchor = "  const [snow, avalanche] = await Promise.all([snowPromise, avalanchePromise])\n"
replacement = "  const [snow, avalanche, resort] = await Promise.all([snowPromise, avalanchePromise, resortPromise])\n"
assert anchor in route, "promise all anchor missing"
route = route.replace(anchor, replacement, 1)

anchor = "    snow,\n    avalanche,\n    forecast: compactForecast(timeseries),\n"
replacement = "    snow,\n    avalanche,\n    resort,\n    forecast: compactForecast(timeseries),\n"
assert anchor in route, "response data anchor missing"
route = route.replace(anchor, replacement, 1)

anchor = "      avalanche: 'Varsom / Snøskredvarslingen i Norge',\n"
replacement = anchor + "      resort: 'Fnugg.no',\n"
assert anchor in route, "sources anchor missing"
route = route.replace(anchor, replacement, 1)

route_path.write_text(route)

home_path = Path("app/HomePageClient.tsx")
home = home_path.read_text()

anchor = """  avalanche: {
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
"""
insert = anchor + """  resort: {
    available: boolean
    id: number | null
    name: string | null
    distance_km: number | null
    resort_open: boolean
    ski_open: boolean
    lift_only: boolean
    lifts_open: number | null
    lifts_total: number | null
    slopes_open: number | null
    slopes_total: number | null
    today_hours: {
      closed: boolean
      from: string | null
      to: string | null
    } | null
    url: string | null
    last_updated: string | null
  }
"""
assert anchor in home, "summary avalanche type anchor missing"
home = home.replace(anchor, insert, 1)

anchor = "  const avalanche = summary?.avalanche ?? null\n"
replacement = anchor + "  const resort = summary?.resort ?? null\n"
assert anchor in home, "avalanche const anchor missing"
home = home.replace(anchor, replacement, 1)

anchor = """  const mainLine = snowLine || (current
    ? `${formatSkiTemperature(current.temp_c)} · ${skiWindDirectionLabel(current.wind_dir_deg)} ${formatSkiMetric(current.wind_mps)} m/s`
    : null)
"""
replacement = anchor + """  const resortStatus = resort?.ski_open
    ? (isNo ? 'Åpent for ski' : 'Skiing open')
    : resort?.lift_only
      ? (isNo ? 'Heis åpen · ingen åpne nedfarter' : 'Lift open · no runs open')
      : (isNo ? 'Stengt' : 'Closed')
  const resortHours = resort?.resort_open
    && resort?.today_hours
    && !resort.today_hours.closed
    && resort.today_hours.from
    && resort.today_hours.to
      ? `${resort.today_hours.from}–${resort.today_hours.to}`
      : null
"""
assert anchor in home, "mainLine anchor missing"
home = home.replace(anchor, replacement, 1)

anchor = """        {summary?.forecast?.length ? (
          <section className="rounded-[28px] border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-5 py-6">
"""
resort_section = r"""        {resort?.available ? (
          <section className="rounded-[28px] border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--fg-45)]">
                  {isNo ? 'LOKALT SKIANLEGG' : 'LOCAL RESORT'}
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--fg-95)]">
                  {resort.name}
                </div>
                <div className="mt-1 text-sm text-[color:var(--fg-55)]">
                  {resortStatus}{resortHours ? ` · ${isNo ? 'i dag' : 'today'} ${resortHours}` : ''}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-03)] px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">
                  {isNo ? 'HEISER' : 'LIFTS'}
                </div>
                <div className="mt-2 text-3xl font-medium tracking-[-0.04em] text-[color:var(--fg-95)]">
                  {formatSkiMetric(resort.lifts_open)} <span className="text-[color:var(--fg-40)]">/ {formatSkiMetric(resort.lifts_total)}</span>
                </div>
                <div className="mt-1 text-xs text-[color:var(--fg-45)]">{isNo ? 'åpne' : 'open'}</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-03)] px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">
                  {isNo ? 'NEDFARTER' : 'RUNS'}
                </div>
                <div className="mt-2 text-3xl font-medium tracking-[-0.04em] text-[color:var(--fg-95)]">
                  {formatSkiMetric(resort.slopes_open)} <span className="text-[color:var(--fg-40)]">/ {formatSkiMetric(resort.slopes_total)}</span>
                </div>
                <div className="mt-1 text-xs text-[color:var(--fg-45)]">{isNo ? 'åpne' : 'open'}</div>
              </div>
            </div>

            {resort.url ? (
              <a
                href={resort.url}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-block text-[11px] text-[color:var(--fg-45)] underline underline-offset-4"
              >
                {isNo ? 'Data fra Fnugg.no' : 'Data from Fnugg.no'} ↗
              </a>
            ) : null}
          </section>
        ) : null}

""" + anchor
assert anchor in home, "forecast section anchor missing"
home = home.replace(anchor, resort_section, 1)

home_path.write_text(home)
