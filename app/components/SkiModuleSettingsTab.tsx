'use client'

import React, { useEffect, useState } from 'react'
import { readTabSnapshot, writeTabSnapshot } from '../lib/tabSnapshotCache.mjs'

type AppLanguage = 'en' | 'no'

type SkiMetSummary = {
  location: { label: string; lat: number; lon: number }
  generated_at: string
  current: {
    temp_c: number | null
    wind_mps: number | null
    wind_dir_deg: number | null
    gust_mps: number | null
    precipitation_1h_mm: number | null
  }
  snow: {
    snow_depth_cm: number | null
    fresh_24h_cm: number | null
    fresh_72h_cm: number | null
    altitude_m: number | null
    source_date: string | null
    grid: { x: number; y: number }
  }
  avalanche: {
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
  resort: {
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
  next_powder_day: {
    found: boolean
    date: string | null
    estimated_fresh_cm_low: number | null
    estimated_fresh_cm_high: number | null
    estimated_fresh_cm_mid: number | null
    precipitation_mm: number | null
    mean_snow_temp_c: number | null
    peak_wind_mps: number | null
    elevation_m: number | null
    basis: 'resort_top' | 'resort_location' | 'selected_location'
    confidence: 'medium' | 'low' | null
  }
  forecast: Array<{
    date: string
    min_temp_c: number | null
    max_temp_c: number | null
    precipitation_mm: number | null
    symbol_code: string | null
    wind_mps: number | null
    wind_dir_deg: number | null
  }>
}

function skiWindDirectionLabel(degrees: number | null | undefined) {
  const value = Number(degrees)
  if (!Number.isFinite(value)) return '–'
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const normalized = ((value % 360) + 360) % 360
  return labels[Math.round(normalized / 45) % labels.length]
}

function formatSkiTemperature(value: number | null | undefined) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '–°'
  return `${Math.round(number)}`.replace('-', '−') + '°'
}

function formatSkiMetric(value: number | null | undefined, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '–'
  return number.toFixed(digits).replace(/\.0+$/, '')
}

function skiForecastDayLabel(date: string, language: AppLanguage) {
  const parsed = new Date(date + 'T12:00:00')
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(language === 'no' ? 'nb-NO' : 'en-GB', { weekday: 'short' }).replace('.', '').toUpperCase()
}

function skiForecastConditionLabel(symbolCode: string | null | undefined, isNo: boolean) {
  const code = String(symbolCode || '').toLowerCase().replace(/_(day|night|polartwilight)$/, '')
  if (!code) return isNo ? 'Vær' : 'Weather'
  if (code.includes('snow')) return isNo ? 'Snø' : 'Snow'
  if (code.includes('sleet')) return isNo ? 'Sludd' : 'Sleet'
  if (code.includes('rain')) return isNo ? 'Regn' : 'Rain'
  if (code.includes('fog')) return isNo ? 'Tåke' : 'Fog'
  if (code.includes('partlycloudy')) return isNo ? 'Delvis skyet' : 'Partly cloudy'
  if (code.includes('cloudy')) return isNo ? 'Skyet' : 'Cloudy'
  if (code.includes('fair')) return isNo ? 'Lettskyet' : 'Fair'
  if (code.includes('clear')) return isNo ? 'Klart' : 'Clear'
  return isNo ? 'Vær' : 'Weather'
}

export default function SkiModuleSettingsTab({
  language,
  userId,
  activeDeviceId,
  modulesJson,
  setModulesJson,
  markDirty,
}: {
  language: AppLanguage
  userId: string | null
  activeDeviceId: string | null
  modulesJson: Record<string, any>
  setModulesJson: React.Dispatch<React.SetStateAction<Record<string, any>>>
  markDirty: (next?: { modulesJson?: Record<string, any> }) => void
}) {
  const isNo = language === 'no'
  const cfg = Array.isArray(modulesJson?.ski) ? modulesJson.ski[0] ?? null : null
  const locationLabel = String(cfg?.label ?? cfg?.name ?? '').trim() || (isNo ? 'Velg sted' : 'Select location')
  const lat = Number(cfg?.lat ?? cfg?.latitude)
  const lon = Number(cfg?.lon ?? cfg?.longitude)
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lon)
  const skiVariant = hasCoordinates ? `loc-${Math.round(lat * 10000)}-${Math.round(lon * 10000)}` : 'none'
  const [firstSkiSnapshot] = useState(() => readTabSnapshot<{summary:SkiMetSummary}>(
    typeof window === 'undefined' ? null : window.localStorage, userId, activeDeviceId, 'ski', skiVariant
  ))
  const [summary, setSummary] = useState<SkiMetSummary | null>(firstSkiSnapshot?.data.summary ?? null)
  const [showingSavedSki, setShowingSavedSki] = useState(!!firstSkiSnapshot)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  function saveLocation(picked: Record<string, unknown>) {
    const next = {
      ...modulesJson,
      ski: [{ id: 1, ...picked }],
    }
    setModulesJson(next)
    markDirty({ modulesJson: next })
  }

  useEffect(() => {
    if (!hasCoordinates) {
      setSummary(null)
      setShowingSavedSki(false)
      setLoading(false)
      setLoadError(false)
      return
    }

    const cached = readTabSnapshot<{summary:SkiMetSummary}>(window.localStorage, userId, activeDeviceId, 'ski', skiVariant)
    setSummary(cached?.data.summary ?? null)
    setShowingSavedSki(!!cached)
    const controller = new AbortController()
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      label: locationLabel,
      lang: language,
    })

    setLoading(!cached)
    setLoadError(false)

    fetch(`/api/ski/summary?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null)
        if (!response.ok || !json?.current) throw new Error('ski_summary_failed')
        return json as SkiMetSummary
      })
      .then((nextSummary) => {
        if (controller.signal.aborted) return
        setSummary(nextSummary)
        setShowingSavedSki(false)
        setLoadError(false)
        writeTabSnapshot(window.localStorage, userId, activeDeviceId, 'ski', skiVariant, {summary:nextSummary})
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        // Keep older conditions visible and clearly marked until a fresh reply.
        if (!cached) {
          setSummary(null)
          setLoadError(true)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [hasCoordinates, lat, lon, locationLabel, language, userId, activeDeviceId, skiVariant])

  const current = summary?.current ?? null
  const snow = summary?.snow ?? null
  const avalanche = summary?.avalanche ?? null
  const resort = summary?.resort ?? null
  const powder = summary?.next_powder_day ?? null
  const snowLine = snow && (snow.fresh_24h_cm != null || snow.snow_depth_cm != null)
    ? `${formatSkiMetric(snow.fresh_24h_cm)} cm ${isNo ? 'nysnø' : 'fresh'} · ${formatSkiMetric(snow.snow_depth_cm)} cm ${isNo ? 'totalt' : 'total'}`
    : null
  const mainLine = snowLine || (current
    ? `${formatSkiTemperature(current.temp_c)} · ${skiWindDirectionLabel(current.wind_dir_deg)} ${formatSkiMetric(current.wind_mps)} m/s`
    : null)
  const resortStatus = resort?.ski_open
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

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain pb-10 pr-1">
      {showingSavedSki && <div role="status" className="mb-2 text-[11px] text-[color:var(--fg-45)]">{isNo ? 'Lagret skivær · oppdateres' : 'Saved ski conditions · refreshing'}</div>}
      <div className={`space-y-6 ${showingSavedSki ? 'pointer-events-none' : ''}`}>
        <WeatherLocationRow
          language={language}
          id={1}
          title={isNo ? 'Skiområde' : 'Ski area'}
          label={locationLabel}
          cfg={cfg}
          showDetails={false}
          onPicked={saveLocation}
        />

        <section className="rounded-[28px] border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-6 py-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--fg-45)]">
            {isNo ? 'SKIFORHOLD' : 'SKI CONDITIONS'}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--fg-95)]">
            {cfg ? locationLabel : (isNo ? 'Velg et område' : 'Choose an area')}
          </div>

          <div className="mt-6">
            {!cfg ? (
              <div className="max-w-sm text-sm leading-6 text-[color:var(--fg-55)]">
                {isNo ? 'Velg et skiområde over for å hente forhold og prognose.' : 'Choose a ski area above to load conditions and forecast.'}
              </div>
            ) : !hasCoordinates ? (
              <div className="text-sm leading-6 text-[color:var(--fg-55)]">
                {isNo ? 'Velg stedet på nytt for å hente data.' : 'Choose the location again to load data.'}
              </div>
            ) : loading && !summary ? (
              <div className="space-y-4" aria-label={isNo ? 'Laster skiforhold' : 'Loading ski conditions'}>
                <div className="h-10 w-48 animate-pulse rounded bg-[color:var(--bd-10)]" />
                <div className="h-4 w-32 animate-pulse rounded bg-[color:var(--bd-10)]" />
              </div>
            ) : loadError ? (
              <div className="text-sm leading-6 text-[color:var(--fg-55)]">
                {isNo ? 'Kunne ikke hente skidata akkurat nå.' : 'Could not load ski data right now.'}
              </div>
            ) : current && mainLine ? (
              <div>
                <div className="text-4xl font-medium tracking-[-0.04em] text-[color:var(--fg-95)]">{mainLine}</div>
                <div className="mt-7 border-t border-[color:var(--bd-10)] pt-5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">
                    {isNo ? 'NESTE PUDDERDAG' : 'NEXT POWDER DAY'}
                  </div>
                  {powder?.found && powder.date ? (
                    <>
                      <div className="mt-1 text-xl font-semibold text-[color:var(--fg-95)]">
                        {skiForecastDayLabel(powder.date, language)} · {formatSkiMetric(powder.estimated_fresh_cm_low)}–{formatSkiMetric(powder.estimated_fresh_cm_high)} cm
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[color:var(--fg-50)]">
                        {isNo ? 'Estimert nysnø' : 'Estimated fresh snow'}
                        {powder.basis === 'resort_top' && powder.elevation_m != null ? ` · ~${formatSkiMetric(powder.elevation_m)} m` : ''}
                        {powder.confidence === 'low' ? ` · ${isNo ? 'lav sikkerhet' : 'low confidence'}` : ''}
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-lg text-[color:var(--fg-70)]">
                      {isNo ? 'Ingen pudderdag i prognosen' : 'No powder day in forecast'}
                    </div>
                  )}
                </div>
                <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[color:var(--bd-10)] pt-5">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">{isNo ? 'NYSNØ 3 DØGN' : 'FRESH 3 DAYS'}</div>
                    <div className="mt-1 text-lg text-[color:var(--fg-80)]">{snow?.fresh_72h_cm != null ? formatSkiMetric(snow.fresh_72h_cm) + ' cm' : '–'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">{isNo ? 'TEMPERATUR' : 'TEMPERATURE'}</div>
                    <div className="mt-1 text-lg text-[color:var(--fg-80)]">{formatSkiTemperature(current.temp_c)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">{isNo ? 'VIND' : 'WIND'}</div>
                    <div className="mt-1 text-lg text-[color:var(--fg-80)]">{skiWindDirectionLabel(current.wind_dir_deg)} · {formatSkiMetric(current.wind_mps)} m/s</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">{isNo ? 'VINDKAST' : 'GUSTS'}</div>
                    <div className="mt-1 text-lg text-[color:var(--fg-80)]">{current.gust_mps != null ? formatSkiMetric(current.gust_mps) + ' m/s' : '–'}</div>
                  </div>
                </div>
                <div className="mt-6 border-t border-[color:var(--bd-10)] pt-5">
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
              </div>
            ) : null}
          </div>
        </section>

        {resort?.available ? (
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

        {summary?.forecast?.length ? (
          <section className="rounded-[28px] border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-5 py-6">
            <div className="px-1">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--fg-45)]">{isNo ? 'NESTE UKE' : 'NEXT WEEK'}</div>
              <div className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[color:var(--fg-90)]">{isNo ? 'Prognose' : 'Forecast'}</div>
            </div>

            <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-2">
              {summary.forecast.map((day) => (
                <div key={day.date} className="min-w-[142px] snap-start rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-03)] px-4 py-4">
                  <div className="text-sm font-semibold tracking-[0.12em] text-[color:var(--fg-85)]">{skiForecastDayLabel(day.date, language)}</div>
                  <div className="mt-1 min-h-10 text-sm leading-5 text-[color:var(--fg-55)]">{skiForecastConditionLabel(day.symbol_code, isNo)}</div>
                  <div className="mt-4 text-xl font-medium text-[color:var(--fg-90)]">
                    {formatSkiTemperature(day.max_temp_c)} <span className="text-[color:var(--fg-45)]">/ {formatSkiTemperature(day.min_temp_c)}</span>
                  </div>
                  <div className="mt-4 space-y-1 text-xs text-[color:var(--fg-50)]">
                    <div>{formatSkiMetric(day.wind_mps)} m/s · {skiWindDirectionLabel(day.wind_dir_deg)}</div>
                    <div>{isNo ? 'Nedbør' : 'Precip'} {formatSkiMetric(day.precipitation_mm, 1)} mm</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

