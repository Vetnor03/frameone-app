import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('existing physical WMO 3 mapping selects the overcast cloud, not the sun',async()=>{
  const icons=await readFile(new URL('../frame/src/assets/icons/ModuleIcons.cpp',import.meta.url),'utf8')
  const mapper=icons.match(/static int wmoToIconKind\(int wmo\) \{[\s\S]*?\n\}/)?.[0]
  const renderer=icons.match(/void drawWeatherIcon\(int cx, int cy, int size, int wmo\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(mapper)
  assert.ok(renderer)
  assert.match(mapper,/if \(wmo == 0\) return 0;/)
  assert.match(mapper,/if \(wmo == 3\) return 2;/)
  assert.match(renderer,/case 0: \{\s*drawSun\(/)
  assert.match(renderer,/case 2: \{\s*drawCloud4Bumps\(/)
})

// Extract a single function rather than all three adaptive renderers and the
// nearby daily forecast helpers. A broad source match used to count 12 icons
// while it was actually spanning distinct render paths.
function functionBody(source, signature) {
  const start=source.indexOf(signature)
  assert.ok(start>=0, 'Missing weather function: '+signature)
  const open=source.indexOf('{',start)
  assert.ok(open>start, 'Missing function body: '+signature)
  let depth=0
  for(let i=open;i<source.length;i++) {
    if(source[i]==='{')depth++
    if(source[i]==='}' && --depth===0)return source.slice(start,i+1)
  }
  assert.fail('Unterminated function: '+signature)
}

test('adaptive Weather uses verified current or tomorrow weather for its hero icon and condition',async()=>{
  const weather=await readFile(new URL('../frame/src/modules/ModuleWeather.cpp',import.meta.url),'utf8')
  const editorial=functionBody(weather,'static bool renderEditorialAdaptiveWeather(')
  const tomorrow=functionBody(weather,'static bool shouldShowTomorrowForecast(')
  assert.match(tomorrow,/data\.dayCount < 2 \|\| !data\.days\[1\]\.valid/)
  assert.match(tomorrow,/localNow\.tm_hour < 20/)
  assert.match(tomorrow,/strcmp\(data\.days\[0\]\.dateYMD, todayYmd\) != 0/)
  assert.match(tomorrow,/strcmp\(data\.days\[1\]\.dateYMD, tomorrowYmd\) == 0/)
  assert.match(editorial,/const bool useTomorrow=shouldShowTomorrowForecast\(data\)/)
  assert.match(editorial,/const DayForecast\* primaryDay=\(useTomorrow && data\.dayCount>1\)\?&data\.days\[1\]:nullptr/)
  assert.match(editorial,/const int primaryWmo=primaryDay\?primaryDay->wmo:data\.currentWmo/)
  assert.match(editorial,/const float primaryTemp=primaryDay\?primaryDay->hiC:data\.tempC/)
  assert.match(editorial,/weatherConditionNo\(primaryWmo\)/)
})

test('adaptive Weather icons use the selected hero WMO and each forecast day WMO',async()=>{
  const weather=await readFile(new URL('../frame/src/modules/ModuleWeather.cpp',import.meta.url),'utf8')
  const calls=body=>[...body.matchAll(/ModuleIcons::drawWeatherIcon\([\s\S]*?\);/g)].map(match=>match[0])
  const legacy=functionBody(weather,'static void renderAdaptiveWeatherLegacy(')
  const editorial=functionBody(weather,'static bool renderEditorialAdaptiveWeather(')
  const forecastStrip=functionBody(weather,'static void weatherEditorialForecastStrip(')
  const forecastStack=functionBody(weather,'static void weatherEditorialForecastStack(')
  const dispatcher=functionBody(weather,'static void renderAdaptiveWeather(')

  // Older fallback has two layout branches; newer editorial has multiple
  // responsive branches. The count across all branches is not two.
  assert.equal(calls(legacy).length,2)
  for(const call of calls(legacy))assert.match(call,/data\.wmo/)
  assert.ok(calls(editorial).length>=2)
  for(const call of calls(editorial)) {
    assert.match(call,/\bprimaryWmo\b/)
    assert.doesNotMatch(call,/data\.currentWmo|data\.wmo/)
  }
  for(const dayRenderer of [forecastStrip,forecastStack]) {
    assert.ok(calls(dayRenderer).length>=1)
    for(const call of calls(dayRenderer))assert.match(call,/\bday\.wmo\b/)
  }
  assert.match(dispatcher,/if\(renderEditorialAdaptiveWeather\(c,cfg,data\)\)return;/)
  assert.match(dispatcher,/renderAdaptiveWeatherLegacy\(c,cfg,data\)/)
})
