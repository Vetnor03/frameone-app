const fs = require('fs')
const path = 'app/HomePageClient.tsx'
let source = fs.readFileSync(path, 'utf8')

const oldTypeStart = source.indexOf('type SkiMetSummary = {')
const oldTypeEnd = source.indexOf('\n\nfunction skiWindDirectionLabel', oldTypeStart)
if (oldTypeStart < 0 || oldTypeEnd < 0) throw new Error('SkiMetSummary block not found')

const nextType = `type SkiMetSummary = {
  location: { label: string; lat: number; lon: number }
  generated_at: string
  current: {
    temp_c: number | null
    wind_mps: number | null
    wind_dir_deg: number | null
    gust_mps: number | null
    precipitation_1h_mm: number | null
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
}`
source = source.slice(0, oldTypeStart) + nextType + source.slice(oldTypeEnd)

const metricFn = `function formatSkiMetric(value: number | null | undefined, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '–'
  return number.toFixed(digits).replace(/\\.0+$/, '')
}`
if (!source.includes(metricFn)) throw new Error('formatSkiMetric block not found')

const helpers = `${metricFn}

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
}`
source = source.replace(metricFn, helpers)

const skiFnStart = source.indexOf('function SkiModuleSettingsTab(')
const returnStart = source.indexOf('  return (\n    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain pr-1 pb-10">', skiFnStart)
const returnEndMarker = '\n  )\n}\n\ntype CountdownItem'
const returnEnd = source.indexOf(returnEndMarker, returnStart)
if (skiFnStart < 0 || returnStart < 0 || returnEnd < 0) throw new Error('Ski return block not found')

const nextReturn = `  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain pb-10 pr-1">
      <div className="space-y-6">
        <WeatherLocationRow
          language={language}
          id={1}
          title={isNo ? 'Skiområde' : 'Ski area'}
          label={locationLabel}
          cfg={cfg}
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
                <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[color:var(--bd-10)] pt-5">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">{isNo ? 'VINDKAST' : 'GUSTS'}</div>
                    <div className="mt-1 text-lg text-[color:var(--fg-80)]">{current.gust_mps != null ? formatSkiMetric(current.gust_mps) + ' m/s' : '–'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--fg-45)]">{isNo ? 'NEDBØR NESTE TIME' : 'PRECIP NEXT HOUR'}</div>
                    <div className="mt-1 text-lg text-[color:var(--fg-80)]">{current.precipitation_1h_mm != null ? formatSkiMetric(current.precipitation_1h_mm, 1) + ' mm' : '–'}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {summary?.forecast?.length ? (
          <section className="rounded-[28px] border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-5 py-6">
            <div className="flex items-end justify-between gap-4 px-1">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--fg-45)]">{isNo ? 'NESTE UKE' : 'NEXT WEEK'}</div>
                <div className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[color:var(--fg-90)]">{isNo ? 'Prognose' : 'Forecast'}</div>
              </div>
              <div className="text-xs text-[color:var(--fg-45)]">MET Norway</div>
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
  )`

source = source.slice(0, returnStart) + nextReturn + source.slice(returnEnd)
fs.writeFileSync(path, source)
