import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {supportsPhysicalCustomLayout,validateCustomGeometry} from '../app/lib/customLayouts.mjs'
import {weatherComposition,weatherLayout,weatherStudioPresets} from '../app/lib/weatherResponsive.mjs'

const adaptive=[[1,1],[1,2],[1,3],[1,4],[2,1],[2,3],[2,4],[3,1],[3,2],[3,3],[3,4],[4,3]]
const boundsX=[9,205,401,597,794],boundsY=[22,136,251,365,480]
function profile(w,h){const width=boundsX[w]-boundsX[0],height=boundsY[h]-boundsY[0],ratio=width/height
  return {width,height,colSpan:w,rowSpan:h,area:w*h,orientation:ratio>1.12?'landscape':ratio<.88?'portrait':'square'}}
function tiling(w,h,module='weather:1'){const cells=[{slot:0,col:0,row:0,colSpan:w,rowSpan:h,module}];let slot=1
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)if(!(col<w&&row<h))cells.push({slot:slot++,col,row,colSpan:1,rowSpan:1,module:'date'})
  return cells}
function applicableProbability(currentTime,hourlyTimes,probabilities){
  const currentDate=currentTime.slice(0,10),currentHour=Number(currentTime.slice(11,13))
  const index=hourlyTimes.findIndex(value=>value.slice(0,10)===currentDate&&Number(value.slice(11,13))===currentHour)
  const value=probabilities[index]
  return Number.isFinite(value)&&value>=0&&value<=100?value:null
}

test('all twelve adaptive Weather geometries are complete physical plans with exact bounds',()=>{
  for(const [w,h] of adaptive){const cells=tiling(w,h),target=cells[0]
    assert.equal(validateCustomGeometry(cells).valid,true,`${w}x${h} structural`)
    assert.equal(supportsPhysicalCustomLayout(cells).valid,true,`${w}x${h} physical`)
    assert.deepEqual([target.colSpan,target.rowSpan],[w,h])
    assert.deepEqual([boundsX[w]-9,boundsY[h]-22],[profile(w,h).width,profile(w,h).height])
  }
})

test('capability accepts exact Weather bases and rejects lookalike prefixes atomically',()=>{
  for(const module of ['weather','weather:1','weather:2','weather:abc'])assert.equal(supportsPhysicalCustomLayout(tiling(3,3,module)).valid,true,module)
  for(const module of ['weatherfoo','weather-foo','notweather','reminders'])assert.equal(supportsPhysicalCustomLayout(tiling(3,3,module)).valid,false,module)
  const mixed=tiling(3,3);mixed[1].module='date';assert.equal(supportsPhysicalCustomLayout(mixed).valid,true)
  mixed[1].module='countdown';assert.deepEqual(supportsPhysicalCustomLayout(mixed).errors,['unsupported_physical_cell'])
})

test('Studio disclosure remains optional and never treats millimetres as probability',()=>{
  const p=profile(3,3),withoutProbability={...weatherStudioPresets.normal,precipitationProbability:null}
  const withoutWind={...weatherStudioPresets.normal,windSpeed:null,windDirection:null}
  assert.equal(weatherComposition(p,withoutProbability).available,true)
  assert.equal(weatherComposition(p,withoutProbability).showPrecipitation,false)
  assert.equal(weatherComposition(p,withoutWind).available,true)
  assert.equal(weatherComposition(p,withoutWind).showWind,false)
})

test('current probability uses the applicable local hourly bucket and rejects invalid ranges',()=>{
  const current='2026-08-24T20:15',times=['2026-08-24T19:00','2026-08-24T20:00','2026-08-24T21:00']
  assert.equal(applicableProbability(current,times,[10,67,80]),67)
  assert.equal(applicableProbability(current,times,[10,-1,80]),null)
  assert.equal(applicableProbability(current,times,[10,101,80]),null)
})

test('physical pixel aspect ratio controls every requested orientation edge case',()=>{
  for(const [w,h,expected] of [[1,2,'portrait'],[2,3,'landscape'],[3,4,'landscape'],[3,3,'landscape'],[1,1,'landscape']])
    assert.equal(profile(w,h).orientation,expected,`${w}x${h}`)
})

test('insight is allocated as details only when forecasts are absent',()=>{
  const p=profile(3,3),noForecast={...weatherStudioPresets.normal,forecast:[]}
  const insightComposition=weatherComposition(p,noForecast),insightLayout=weatherLayout(p,insightComposition)
  assert.equal(insightComposition.showInsight,true);assert.equal(insightComposition.forecastRows,0);assert.ok(insightLayout.detailsRect)
  const forecastComposition=weatherComposition(p,weatherStudioPresets.normal)
  assert.ok(forecastComposition.forecastRows>0);assert.equal(forecastComposition.showInsight,false)
})

test('firmware uses the Studio architecture while preserving all four anchors',async()=>{
  const [weather,renderer,route]=await Promise.all(['frame/src/modules/ModuleWeather.cpp','frame/src/modules/ModuleRenderer.cpp','app/api/weather/details/route.ts'].map(p=>readFile(new URL(`../${p}`,import.meta.url),'utf8')))
  assert.match(weather,/app\/lib\/weatherResponsive\.mjs/)
  assert.match(weather,/aspectRatio = c\.h > 0 \? \(float\)c\.w \/ \(float\)c\.h/)
  assert.match(weather,/aspectRatio > 1\.12f[\s\S]*aspectRatio < 0\.88f/)
  assert.match(weather,/const bool hasDetails = showRange \|\| showWind \|\| showProbability \|\| showInsight/)
  assert.match(weather,/large && forecastRows == 0 && insight\[0\]/)
  assert.match(weather,/sameDateAsCurrent && hour == currentHour/)
  assert.match(weather,/probability >= 0\.0f && probability <= 100\.0f/)
  assert.doesNotMatch(weather,/strcmp\(ts, currentTimeIso\)/)
  assert.match(weather,/const bool showRange = area >= 3 && cfg\.showHiLo/)
  const dispatch=weather.match(/void render\(const Cell& c,[\s\S]*?\n}/)[0]
  assert.ok(dispatch.indexOf('CELL_ADAPTIVE')<dispatch.indexOf('CELL_SMALL'))
  for(const anchor of ['CELL_SMALL','CELL_MEDIUM','CELL_LARGE','CELL_XL'])assert.match(dispatch,new RegExp(anchor))
  assert.match(renderer,/module\[7\] == '\\0' \|\| module\[7\] == ':'/)
  assert.match(route,/wind_direction_10m/);assert.match(route,/precipitation_probability/)
  assert.doesNotMatch(weather,/currentPrecipProbability\s*=\s*[^;]*(?:precipMm|precipitation_sum)/)
})
