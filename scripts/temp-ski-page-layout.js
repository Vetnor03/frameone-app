const fs = require('fs')
const path = 'app/HomePageClient.tsx'
let source = fs.readFileSync(path, 'utf8')

const startMarker = '  return (\n    <div className="h-full min-h-0 flex flex-col">\n      <div className="mt-2">\n        <WeatherLocationRow\n          language={language}\n          id={1}\n          title={isNo ? \'Sted\' : \'Location\'}'
const functionStart = source.indexOf('function SkiModuleSettingsTab({')
const start = source.indexOf(startMarker, functionStart)
const endMarker = '\n}\n\ntype CountdownItem = {'
const end = source.indexOf(endMarker, start)

if (functionStart < 0 || start < 0 || end < 0) throw new Error('Could not locate current Ski settings layout')

const replacement = `  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain pr-1 pb-10">
      <div className="mt-2">
        <WeatherLocationRow
          language={language}
          id={1}
          title={isNo ? 'Skiområde' : 'Ski area'}
          label={locationLabel}
          cfg={cfg}
          onPicked={saveLocation}
        />
      </div>

      <section className="mt-9">
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[color:var(--fg-45)]">
            {isNo ? 'SKIFORHOLD' : 'SKI CONDITIONS'}
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--fg-95)]">
            {cfg ? locationLabel : (isNo ? 'Velg et område' : 'Choose an area')}
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-6 py-6">
          {!cfg ? (
            <div className="max-w-sm text-sm leading-6 text-[color:var(--fg-55)]">
              {isNo ? 'Velg et skiområde over. Her samler vi vær, snø og skredfare i én enkel oversikt.' : 'Choose a ski area above. Weather, snow and avalanche information will be collected here in one simple summary.'}
            </div>
          ) : !hasCoordinates ? (
            <div className="text-sm leading-6 text-[color:var(--fg-55)]">
              {isNo ? 'Velg stedet på nytt for å hente data.' : 'Choose the location again to load data.'}
            </div>
          ) : loading && !summary ? (
            <div className="space-y-4" aria-label={isNo ? 'Laster skiforhold' : 'Loading ski conditions'}>
              <div className="h-10 w-48 animate-pulse rounded bg-[color:var(--bd-10)]" />
              <div className="h-4 w-32 animate-pulse rounded bg-[color:var(--bd-10)]" />
              <div className="h-4 w-40 animate-pulse rounded bg-[color:var(--bd-10)]" />
            </div>
          ) : loadError ? (
            <div className="text-sm leading-6 text-[color:var(--fg-55)]">
              {isNo ? 'Kunne ikke hente skidata akkurat nå.' : 'Could not load ski data right now.'}
            </div>
          ) : current && mainLine ? (
            <div>
              <div className="text-4xl font-medium tracking-[-0.04em] text-[color:var(--fg-95)]">{mainLine}</div>

              <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="border-t border-[color:var(--bd-10)] pt-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--fg-45)]">
                    {isNo ? 'VINDKAST' : 'GUSTS'}
                  </div>
                  <div className="mt-1 text-lg text-[color:var(--fg-80)]">
                    {current.gust_mps != null ? formatSkiMetric(current.gust_mps) + ' m/s' : '–'}
                  </div>
                </div>

                <div className="border-t border-[color:var(--bd-10)] pt-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--fg-45)]">
                    {isNo ? 'NEDBØR NESTE TIME' : 'PRECIP NEXT HOUR'}
                  </div>
                  <div className="mt-1 text-lg text-[color:var(--fg-80)]">
                    {current.precipitation_1h_mm != null ? formatSkiMetric(current.precipitation_1h_mm, 1) + ' mm' : '–'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-10 border-t border-[color:var(--bd-10)] pt-6 pb-2">
        <div className="text-sm font-medium text-[color:var(--fg-80)]">
          {isNo ? 'Kommer i denne oversikten' : 'Coming to this summary'}
        </div>
        <div className="mt-3 space-y-3 text-sm leading-6 text-[color:var(--fg-50)]">
          <div>{isNo ? 'Snødybde og nysnø' : 'Snow depth and fresh snow'}</div>
          <div>{isNo ? 'Skredfare og utsatte himmelretninger' : 'Avalanche danger and exposed aspects'}</div>
          <div>{isNo ? 'Neste snøfall' : 'Next snowfall'}</div>
        </div>
      </section>
    </div>
  )`

source = source.slice(0, start) + replacement + source.slice(end)
fs.writeFileSync(path, source)
