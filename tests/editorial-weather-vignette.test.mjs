import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {WEATHER_VIGNETTE_SCENES,weatherCoastalCurves,weatherCoastalSkyFor} from
  '../app/lib/editorialWeatherVignette.mjs'

test('coastal weather scene priority matches firmware rain, snow, wind and overcast rules',()=>{
  assert.equal(weatherCoastalSkyFor(0,3),'fair')
  assert.equal(weatherCoastalSkyFor(2,3),'fair')
  assert.equal(weatherCoastalSkyFor(3,3),'overcast')
  assert.equal(weatherCoastalSkyFor(2,10),'wind')
  assert.equal(weatherCoastalSkyFor(61,12),'rain')
  assert.equal(weatherCoastalSkyFor(73,12),'snow')
  assert.equal(weatherCoastalSkyFor(85,1),'snow')
})
test('all six scenes use hand-composed Bézier handles inside the 140x96 plate',()=>{
  for(const [name,sample] of Object.entries(WEATHER_VIGNETTE_SCENES)){
    const lines=weatherCoastalCurves(sample.wmo,sample.windMs)
    assert.ok(lines.length>=17,name)
    for(const line of lines){
      assert.equal(line.length,8)
      assert.ok(line.every((value,index)=>Number.isFinite(value) &&
        value>=0 && value <= (index%2===0?140:96)),name+':'+line)
    }
  }
})
test('same coastal contour coordinates are used in both JS and firmware',()=>{
  const cpp=readFileSync(new URL('../frame/src/display/EditorialFigures.h',import.meta.url),'utf8')
  assert.match(cpp,/weatherCoastalVignette/)
  assert.match(cpp,/coastalSkyFor/)

  // Prove every base and weather-variant curve matches the hardware control points.
  const names=['shore','cloud','fair','overcast','wind','rain','snow']
  const expected=[
    weatherCoastalCurves(0,2),
    weatherCoastalCurves(2,2),
    weatherCoastalCurves(3,2),
    weatherCoastalCurves(2,9),
    weatherCoastalCurves(61,2),
    weatherCoastalCurves(73,2),
  ]
  for(const name of names) {
    const block=cpp.match(new RegExp('static const uint8_t '+name+
      '\\\\[\\\\]\\\\[8\\\\] = \\\\{([\\\\s\\\\S]*?)\\\\n  \\\\};'))?.[1]
    assert.ok(block,'C++ array '+name)
    const points=[...block.matchAll(/\\{([\\d,]+)\\}/g)].map(m=>m[1].split(',').map(Number))
    assert.ok(points.length>=2,name)
    const jsFamily=expected.find(scene=>scene.some(curve=>
      points.some(point=>point.every((n,index)=>n===curve[index]))))
    assert.ok(jsFamily,'missing JS counterpart '+name)
    // Compare every control point with at least one weather scene.
    for(const point of points)assert.ok(expected.some(scene=>
      scene.some(curve=>curve.every((n,index)=>n===point[index]))),
      name+':'+point.join(','))
  }
  assert.match(cpp,/if\\(sky==COAST_RAIN\\)/)
  assert.match(cpp,/else if\\(sky==COAST_SNOW\\)/)
})
